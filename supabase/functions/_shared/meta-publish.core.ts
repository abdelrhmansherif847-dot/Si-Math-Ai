// Si Math AI — L1 publishing request builders.
//
// PURE. Every function here returns a WriteRequest object and nothing else.
// No client, no fetch, no environment, no I/O of any kind — this module CANNOT
// contact Meta, which is why it can be tested exhaustively with no account and
// no risk. Sending is meta-graph.core.ts's job, behind its gates.
//
// Specification: docs/engineering/meta-marketing-integration.md §10.1.
//
// =====================================================================
// WHAT L1 DELIBERATELY DOES NOT CONTAIN
// =====================================================================
// There is NO media_publish builder here, and there must not be one until L2
// is approved. L1's whole definition is "writes that produce nothing publicly
// visible": an Instagram container that is never published expires unseen in
// about 24 hours, and an unpublished Page post is not on the timeline. Adding
// a publish builder would put the one irreversible, externally-visible
// operation one function call away from a test path — so it is absent by
// design, not by oversight.
// =====================================================================

import type { WriteRequest } from './meta-graph.core.ts';

/** Instagram caption limit. Exceeding it is rejected at publish time, which is
 *  far too late to find out — the container has already been created. */
export const IG_CAPTION_MAX = 2200;

/** Facebook rejects an empty message with a generic error. Caught here so the
 *  message names the field. */
export const FB_MESSAGE_MAX = 63206;

export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildError';
  }
}

/** Meta fetches media from ITS OWN servers, so the url must be publicly
 *  reachable and https. This is the single most likely cause of a first-time
 *  L1 failure: a signed or short-lived generator url looks fine in a browser
 *  and is invisible to Meta. Checked here so it fails in the builder — with a
 *  sentence explaining why — instead of as an opaque container error. */
export function assertPublicMediaUrl(url: string, field: string): void {
  if (!url || typeof url !== 'string') throw new BuildError(`${field} is required`);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new BuildError(`${field} is not a valid url`); }
  if (parsed.protocol !== 'https:') {
    throw new BuildError(`${field} must be https — Meta refuses to fetch plain http`);
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1)/i.test(parsed.hostname)) {
    throw new BuildError(
      `${field} points at localhost. Meta fetches media from its own servers, so the ` +
      'url must be reachable from the public internet, not from this machine.');
  }
}

export function assertCaption(caption: string, max: number, field: string): void {
  if (typeof caption !== 'string') throw new BuildError(`${field} must be a string`);
  if (caption.length > max) {
    throw new BuildError(`${field} is ${caption.length} characters; the limit is ${max}`);
  }
}

// ── Instagram ──────────────────────────────────────────────────────────────

/** Step 1 of Instagram's container-then-publish flow, and the ONLY step L1
 *  performs. The container is not a post: it becomes one only when
 *  media_publish is called, which L1 never does. */
export function buildIgImageContainer(args: {
  igUserId: string; imageUrl: string; caption?: string;
}): WriteRequest {
  if (!args.igUserId) throw new BuildError('igUserId is required');
  assertPublicMediaUrl(args.imageUrl, 'imageUrl');
  const caption = args.caption ?? '';
  assertCaption(caption, IG_CAPTION_MAX, 'caption');

  return {
    method: 'POST',
    path: `${args.igUserId}/media`,
    body: { image_url: args.imageUrl, ...(caption ? { caption } : {}) },
    capability: 'publish',
    summary: `create Instagram image container for ${args.igUserId} ` +
      `(${caption.length} char caption) — NOT published`,
  };
}

export function buildIgReelContainer(args: {
  igUserId: string; videoUrl: string; caption?: string; coverUrl?: string;
  shareToFeed?: boolean;
}): WriteRequest {
  if (!args.igUserId) throw new BuildError('igUserId is required');
  assertPublicMediaUrl(args.videoUrl, 'videoUrl');
  if (args.coverUrl) assertPublicMediaUrl(args.coverUrl, 'coverUrl');
  const caption = args.caption ?? '';
  assertCaption(caption, IG_CAPTION_MAX, 'caption');

  return {
    method: 'POST',
    path: `${args.igUserId}/media`,
    body: {
      media_type: 'REELS',
      video_url: args.videoUrl,
      ...(caption ? { caption } : {}),
      ...(args.coverUrl ? { cover_url: args.coverUrl } : {}),
      ...(args.shareToFeed === undefined ? {} : { share_to_feed: args.shareToFeed }),
    },
    capability: 'publish',
    summary: `create Instagram REELS container for ${args.igUserId} — NOT published`,
  };
}

// ── Facebook Page ──────────────────────────────────────────────────────────

/** An UNPUBLISHED Page post. `published: false` keeps it off the timeline;
 *  it exists as an object so the write path can be proven end to end, and it
 *  is deleted immediately afterwards by buildDeleteObject().
 *
 *  published is hardcoded false and is not a parameter. A published Page post
 *  is externally visible, which is L2, and a boolean argument is one typo away
 *  from making it so. */
export function buildPageUnpublishedPost(args: {
  pageId: string; message: string; link?: string;
}): WriteRequest {
  if (!args.pageId) throw new BuildError('pageId is required');
  if (!args.message || !args.message.trim()) throw new BuildError('message is required');
  assertCaption(args.message, FB_MESSAGE_MAX, 'message');
  if (args.link) assertPublicMediaUrl(args.link, 'link');

  return {
    method: 'POST',
    path: `${args.pageId}/feed`,
    body: {
      message: args.message,
      ...(args.link ? { link: args.link } : {}),
      published: false,
    },
    capability: 'publish',
    summary: `create UNPUBLISHED Page post on ${args.pageId} — not on the timeline`,
  };
}

/** The rollback for anything L1 creates that can be deleted. Idempotent at the
 *  API level: deleting an already-gone object is the outcome we wanted. */
export function buildDeleteObject(objectId: string, capability: 'publish' | 'ads' = 'publish'): WriteRequest {
  if (!objectId) throw new BuildError('objectId is required');
  return {
    method: 'DELETE',
    path: objectId,
    body: {},
    capability,
    summary: `delete ${objectId}`,
  };
}
