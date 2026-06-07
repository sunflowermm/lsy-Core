import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import cfg from '#infrastructure/config/config.js';
import { HttpResponse } from '#utils/http-utils.js';
import { requireUser } from './auth.js';
import {
  ensureUserWorkspace,
  getUploadsDir,
  isPathInsideWorkspace,
  readUserAgents,
  writeUserAgents
} from '../lib/user-workspace.js';
import { assertAiReadable, assertUserDeletable } from '../lib/path-policy.js';
import { listWorkspaceFiles } from '../lib/workspace-tools.js';
import { readAuditTail } from '../lib/audit.js';

function createUserUploader(username) {
  const uploadsDir = getUploadsDir(username);
  return multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fs.mkdir(uploadsDir, { recursive: true });
        cb(null, uploadsDir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (_req, file, cb) => {
      const base = path.basename(file.originalname || 'file').replace(/[^\w.\-()\u4e00-\u9fff]/g, '_');
      cb(null, `${Date.now()}_${base}`);
    }
  });
}

async function handleUpload(req, res, username) {
  await ensureUserWorkspace(username);
  const maxFileSize = cfg?.server?.limits?.fileSize || '50mb';
  const upload = (req.createMultipartUploader || (() => req.multipartUpload))({
    storage: createUserUploader(username),
    fileSize: maxFileSize,
    files: 10
  }).any();

  await new Promise((resolve, reject) => upload(req, res, (err) => (err ? reject(err) : resolve())));

  const files = (Array.isArray(req.files) ? req.files : []).map((f) => ({
    name: f.originalname,
    path: `uploads/${f.filename}`,
    size: f.size,
    mimetype: f.mimetype
  }));

  HttpResponse.success(res, { files, uploadsDir: 'uploads/' }, '上传成功');
}

export default {
  name: 'lsy-workspace',
  dsc: '李诗雅用户工作区：文件、AGENTS.md、审计',
  priority: 91,

  routes: [
    {
      method: 'POST',
      path: '/api/lsy/files/upload',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        try {
          await handleUpload(req, res, session.username);
        } catch (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return HttpResponse.error(res, new Error('文件过大（图片建议 ≤8MB）'), 413, 'lsy.upload');
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return HttpResponse.validationError(res, '单次最多上传 10 个文件');
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return HttpResponse.validationError(res, '上传字段无效');
          }
          throw err;
        }
      }, 'lsy.workspace.upload')
    },

    {
      method: 'GET',
      path: '/api/lsy/files',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        const subdir = String(req.query.dir || '').replace(/\.\./g, '');
        const files = await listWorkspaceFiles(session.username, { subdir, maxDepth: 2 });
        HttpResponse.success(res, { files, workspace: session.username });
      }, 'lsy.workspace.list')
    },

    {
      method: 'GET',
      path: '/api/lsy/files/download',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        let filePath;
        try {
          filePath = assertAiReadable(String(req.query.path || ''));
        } catch (err) {
          return HttpResponse.validationError(res, err.message);
        }
        const ws = await ensureUserWorkspace(session.username);
        const full = path.join(ws, filePath);
        if (!isPathInsideWorkspace(full, ws)) {
          return HttpResponse.forbidden(res, '路径越界');
        }
        try {
          const st = await fs.stat(full);
          if (!st.isFile()) return HttpResponse.notFound(res, '文件不存在');
        } catch {
          return HttpResponse.notFound(res, '文件不存在');
        }
        return res.download(full, path.basename(full));
      }, 'lsy.workspace.download')
    },

    {
      method: 'DELETE',
      path: '/api/lsy/files',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        let filePath;
        try {
          filePath = assertUserDeletable(String(req.query.path || req.body?.path || ''));
        } catch (err) {
          return HttpResponse.validationError(res, err.message);
        }
        const ws = await ensureUserWorkspace(session.username);
        const full = path.join(ws, filePath);
        if (!isPathInsideWorkspace(full, ws)) {
          return HttpResponse.forbidden(res, '路径越界');
        }
        await fs.unlink(full);
        HttpResponse.success(res, null, '已删除');
      }, 'lsy.workspace.delete')
    },

    {
      method: 'GET',
      path: '/api/lsy/workspace/agents',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        const content = await readUserAgents(session.username);
        HttpResponse.success(res, { path: 'AGENTS.md', content });
      }, 'lsy.workspace.agents.get')
    },

    {
      method: 'PUT',
      path: '/api/lsy/workspace/agents',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        const content = req.body?.content;
        if (typeof content !== 'string') {
          return HttpResponse.validationError(res, 'content 必须为字符串');
        }
        try {
          const saved = await writeUserAgents(session.username, content);
          HttpResponse.success(res, { path: 'AGENTS.md', content: saved }, '已保存');
        } catch (err) {
          return HttpResponse.validationError(res, err.message);
        }
      }, 'lsy.workspace.agents.put')
    },

    {
      method: 'GET',
      path: '/api/lsy/workspace/audit',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const entries = await readAuditTail(session.username, limit);
        HttpResponse.success(res, { entries });
      }, 'lsy.workspace.audit')
    }
  ]
};
