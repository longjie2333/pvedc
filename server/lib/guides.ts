import { randomUUID } from 'node:crypto';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { Forward, Guide, Resource } from '../../shared/schema';
import { guideSchema } from '../../shared/schema';
import { getDb, now } from './db';

interface GuideRow { id: string; title: string; markdown: string; sort_order: number; default_collapsed: number; published: number; created_at: number; updated_at: number }
export interface GuideView { id: string; title: string; html: string; defaultCollapsed: boolean; sortOrder: number }

export function guides(): Guide[] {
  return (getDb().prepare('SELECT * FROM guides ORDER BY sort_order,updated_at DESC,id').all() as GuideRow[]).map(row => ({
    id: row.id, title: row.title, markdown: row.markdown, sortOrder: row.sort_order, defaultCollapsed: !!row.default_collapsed,
    published: !!row.published, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export function saveGuide(input: unknown, id: string = randomUUID()): Guide {
  const value = guideSchema.parse(input), timestamp = now();
  getDb().prepare(`INSERT INTO guides(id,title,markdown,sort_order,default_collapsed,published,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,markdown=excluded.markdown,sort_order=excluded.sort_order,
    default_collapsed=excluded.default_collapsed,published=excluded.published,updated_at=excluded.updated_at`)
    .run(id, value.title, value.markdown, value.sortOrder, value.defaultCollapsed ? 1 : 0, value.published ? 1 : 0, timestamp, timestamp);
  return guides().find(guide => guide.id === id)!;
}

export function removeGuide(id: string) {
  getDb().prepare('DELETE FROM guides WHERE id=?').run(id);
}

function escapeText(value: unknown) {
  return String(value ?? '—').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function machineValue(resource: Resource | undefined, key: string) {
  if (!resource) return '—';
  const values: Record<string, unknown> = {
    studentId: resource.studentId, hostname: resource.studentId, vmid: resource.vmid, ip: resource.ip,
    profile: resource.spec.name, distro: resource.spec.distro, cores: resource.spec.cores,
    memory: resource.spec.memory + ' MiB', disk: resource.spec.disk + ' GiB',
  };
  return values[key] === undefined ? '—' : values[key];
}

function replacePlaceholders(markdown: string, resource: Resource | undefined, rules: Forward[], publicHost: string) {
  return markdown.replace(/\{\{([^{}]+)\}\}/g, (_, expression: string) => {
    const machine = expression.match(/^machine\.([A-Za-z][A-Za-z0-9]*)$/);
    if (machine) return escapeText(machineValue(resource, machine[1]));
    const forward = expression.match(/^forward:(\d+)$/);
    if (forward) {
      const targetPort = Number(forward[1]);
      const matches = rules.filter(rule => rule.targetPort === targetPort && rule.enabled);
      if (!matches.length) return escapeText('该 ' + targetPort + ' 端口未转发');
      return matches.map(rule => escapeText((publicHost || '公网主机未配置') + ':' + rule.publicPort)).join(' · ');
    }
    return escapeText('{{' + expression + '}}');
  });
}

export async function renderGuide(guide: Guide, resource: Resource | undefined, rules: Forward[], publicHost: string): Promise<GuideView> {
  const source = replacePlaceholders(guide.markdown, resource, rules, publicHost);
  const parsed = await marked.parse(source);
  return { id: guide.id, title: guide.title, html: sanitizeHtml(parsed), defaultCollapsed: guide.defaultCollapsed, sortOrder: guide.sortOrder };
}

export async function publishedGuideViews(resource: Resource | undefined, rules: Forward[], publicHost: string) {
  return Promise.all(guides().filter(guide => guide.published).map(guide => renderGuide(guide, resource, rules, publicHost)));
}
