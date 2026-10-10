"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

function roleLabel(role: string, categoryName?: string | null): string {
  switch (role) {
    case "PROVIDER":
      return categoryName ? `${categoryName} Provider` : "Service Provider"
    case "SHOPKEEPER":
      return "Shopkeeper"
    case "CUSTOMER":
      return "Community Member"
    default:
      return "Team Member"
  }
}

export type PostItem = {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  authorVerified: boolean
  authorRole: string
  authorFollowers: number
  content: string
  images: string[]
  video: string | null
  location: string | null
  likeCount: number
  commentCount: number
  shareCount: number
  createdAt: string
  isLiked: boolean
  isSaved: boolean
  isMine: boolean
}

export async function getPosts(): Promise<PostItem[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null

  const posts = await db.post.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      author: {
        include: {
          providerProfile: { include: { category: true } },
          _count: { select: { followedBy: true } },
        },
      },
    },
  })

  let likedIds = new Set<string>()
  let savedIds = new Set<string>()
  if (myId && posts.length > 0) {
    const postIds = posts.map((p) => p.id)
    const [likes, saves] = await Promise.all([
      db.postLike.findMany({ where: { userId: myId, postId: { in: postIds } } }),
      db.postSave.findMany({ where: { userId: myId, postId: { in: postIds } } }),
    ])
    likedIds = new Set(likes.map((l) => l.postId))
    savedIds = new Set(saves.map((s) => s.postId))
  }

  return posts.map((p) => ({
    id: p.id,
    authorId: p.authorId,
    authorName: p.author.name,
    authorAvatar: p.author.image,
    authorVerified: p.author.role === "PROVIDER" ? (p.author.providerProfile?.verified ?? false) : false,
    authorRole: roleLabel(p.author.role, p.author.providerProfile?.category?.name),
    authorFollowers: p.author._count.followedBy,
    content: p.content,
    images: p.images,
    video: p.video,
    location: p.location,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    shareCount: p.shareCount,
    createdAt: p.createdAt.toISOString(),
    isLiked: likedIds.has(p.id),
    isSaved: savedIds.has(p.id),
    isMine: myId === p.authorId,
  }))
}

export async function getFollowingIds(): Promise<string[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const follows = await db.follow.findMany({ where: { followerId: session.user.id } })
  return follows.map((f) => f.followingId)
}

export type CommunityActionResult = { success: true } | { success: false; error: string }
export type ToggleResult = { success: true; isActive: boolean; count: number } | { success: false; error: string }

const postIdSchema = z.object({ postId: z.string().trim().min(1) })

export async function toggleLike(input: unknown): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = postIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { postId } = parsed.data
  const userId = session.user.id

  const existing = await db.postLike.findUnique({ where: { postId_userId: { postId, userId } } })
  if (existing) {
    const [, post] = await db.$transaction([
      db.postLike.delete({ where: { id: existing.id } }),
      db.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
    ])
    return { success: true, isActive: false, count: post.likeCount }
  }
  const [, post] = await db.$transaction([
    db.postLike.create({ data: { postId, userId } }),
    db.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
  ])
  return { success: true, isActive: true, count: post.likeCount }
}

export async function toggleSave(input: unknown): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = postIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { postId } = parsed.data
  const userId = session.user.id

  const existing = await db.postSave.findUnique({ where: { postId_userId: { postId, userId } } })
  if (existing) {
    await db.postSave.delete({ where: { id: existing.id } })
    return { success: true, isActive: false, count: 0 }
  }
  await db.postSave.create({ data: { postId, userId } })
  return { success: true, isActive: true, count: 0 }
}

const followSchema = z.object({ userId: z.string().trim().min(1) })

export async function toggleFollow(input: unknown): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = followSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const targetId = parsed.data.userId
  if (targetId === session.user.id) return { success: false, error: "You can't follow yourself." }

  const existing = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: session.user.id, followingId: targetId } },
  })
  if (existing) {
    await db.follow.delete({ where: { id: existing.id } })
  } else {
    await db.follow.create({ data: { followerId: session.user.id, followingId: targetId } })
  }
  const count = await db.follow.count({ where: { followingId: targetId } })
  return { success: true, isActive: !existing, count }
}

export type CommentItem = {
  id: string
  authorName: string
  authorAvatar: string | null
  content: string
  createdAt: string
  isMine: boolean
}

export async function getComments(postId: string): Promise<CommentItem[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null
  const comments = await db.postComment.findMany({ where: { postId }, orderBy: { createdAt: "asc" }, include: { user: true } })
  return comments.map((c) => ({
    id: c.id,
    authorName: c.user.name,
    authorAvatar: c.user.image,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    isMine: myId === c.userId,
  }))
}

const addCommentSchema = z.object({ postId: z.string().trim().min(1), content: z.string().trim().min(1, "Write a comment") })

export async function addComment(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = addCommentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { postId, content } = parsed.data

  await db.$transaction([
    db.postComment.create({ data: { postId, userId: session.user.id, content } }),
    db.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } }),
  ])
  return { success: true }
}

const createPostSchema = z.object({
  content: z.string().trim().max(2000).optional().default(""),
  images: z.array(z.string()).max(4).optional().default([]),
  video: z.string().optional(),
  location: z.string().trim().optional(),
})

export type CreatePostResult = { success: true; postId: string } | { success: false; error: string }

export async function createPost(input: unknown): Promise<CreatePostResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = createPostSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { content, images, video, location } = parsed.data
  if (!content.trim() && images.length === 0 && !video) return { success: false, error: "Write something or add media." }

  const post = await db.post.create({ data: { authorId: session.user.id, content, images, video, location } })
  return { success: true, postId: post.id }
}

const deletePostSchema = z.object({ postId: z.string().trim().min(1) })

export async function deletePost(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = deletePostSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  await db.post.deleteMany({ where: { id: parsed.data.postId, authorId: session.user.id } })
  return { success: true }
}

const reportPostSchema = z.object({ postId: z.string().trim().min(1), reason: z.string().trim().min(3).max(300) })

/** Writes a real ContentReport — the same table Admin's Moderation queue
 * (lib/actions/admin-moderation.ts) already reads from. That queue existed
 * with no way to ever receive anything; this is the missing entry point. */
export async function reportPost(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = reportPostSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { postId, reason } = parsed.data

  const post = await db.post.findUnique({ where: { id: postId } })
  if (!post) return { success: false, error: "Post not found." }
  if (post.authorId === session.user.id) return { success: false, error: "You can't report your own post." }

  await db.contentReport.create({
    data: {
      targetType: "POST",
      targetId: postId,
      contentSnapshot: post.content.slice(0, 500),
      reportedUserId: post.authorId,
      reporterId: session.user.id,
      reason,
    },
  })
  return { success: true }
}

const reportCommentSchema = z.object({ commentId: z.string().trim().min(1), reason: z.string().trim().min(3).max(300) })

export async function reportComment(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = reportCommentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { commentId, reason } = parsed.data

  const comment = await db.postComment.findUnique({ where: { id: commentId } })
  if (!comment) return { success: false, error: "Comment not found." }
  if (comment.userId === session.user.id) return { success: false, error: "You can't report your own comment." }

  await db.contentReport.create({
    data: {
      targetType: "POST_COMMENT",
      targetId: commentId,
      contentSnapshot: comment.content.slice(0, 500),
      reportedUserId: comment.userId,
      reporterId: session.user.id,
      reason,
    },
  })
  return { success: true }
}

export type GroupItem = {
  id: string
  name: string
  description: string | null
  image: string | null
  memberCount: number
  isJoined: boolean
}

export async function getGroups(): Promise<GroupItem[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null

  const groups = await db.group.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  })

  let joinedIds = new Set<string>()
  if (myId) {
    const memberships = await db.groupMembership.findMany({ where: { userId: myId } })
    joinedIds = new Set(memberships.map((m) => m.groupId))
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    image: g.image,
    memberCount: g._count.members,
    isJoined: joinedIds.has(g.id),
  }))
}

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().min(1, "Description is required"),
})

export async function createGroup(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = createGroupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const userId = session.user.id

  await db.$transaction(async (tx) => {
    const group = await tx.group.create({ data: { name: parsed.data.name, description: parsed.data.description, createdById: userId } })
    await tx.groupMembership.create({ data: { groupId: group.id, userId, isAdmin: true } })
  })
  return { success: true }
}

const groupIdSchema = z.object({ groupId: z.string().trim().min(1) })

export async function toggleJoinGroup(input: unknown): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = groupIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { groupId } = parsed.data
  const userId = session.user.id

  const existing = await db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } })
  if (existing) {
    await db.groupMembership.delete({ where: { id: existing.id } })
  } else {
    await db.groupMembership.create({ data: { groupId, userId } })
  }
  const count = await db.groupMembership.count({ where: { groupId } })
  return { success: true, isActive: !existing, count }
}

export type GroupDetail = {
  id: string
  name: string
  description: string | null
  image: string | null
  memberCount: number
  isJoined: boolean
  isAdmin: boolean
  createdById: string
} | null

export async function getGroupDetail(groupId: string): Promise<GroupDetail> {
  const session = await auth()
  const myId = session?.user?.id ?? null

  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { _count: { select: { members: true } } },
  })
  if (!group) return null

  const membership = myId ? await db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId: myId } } }) : null

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    image: group.image,
    memberCount: group._count.members,
    isJoined: !!membership,
    isAdmin: membership?.isAdmin ?? false,
    createdById: group.createdById,
  }
}

export type GroupMemberItem = { id: string; name: string; avatar: string | null; isAdmin: boolean; joinedAt: string }

export async function getGroupMembers(groupId: string): Promise<GroupMemberItem[]> {
  const memberships = await db.groupMembership.findMany({
    where: { groupId },
    orderBy: [{ isAdmin: "desc" }, { joinedAt: "asc" }],
    include: { user: true },
  })
  return memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    avatar: m.user.image,
    isAdmin: m.isAdmin,
    joinedAt: m.joinedAt.toISOString(),
  }))
}

export type GroupPostItem = {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  content: string
  images: string[]
  likeCount: number
  commentCount: number
  createdAt: string
  isLiked: boolean
  isMine: boolean
}

export async function getGroupPosts(groupId: string): Promise<GroupPostItem[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null

  const posts = await db.groupPost.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: true },
  })

  let likedIds = new Set<string>()
  if (myId && posts.length > 0) {
    const likes = await db.groupPostLike.findMany({ where: { userId: myId, groupPostId: { in: posts.map((p) => p.id) } } })
    likedIds = new Set(likes.map((l) => l.groupPostId))
  }

  return posts.map((p) => ({
    id: p.id,
    authorId: p.authorId,
    authorName: p.author.name,
    authorAvatar: p.author.image,
    content: p.content,
    images: p.images,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    createdAt: p.createdAt.toISOString(),
    isLiked: likedIds.has(p.id),
    isMine: myId === p.authorId,
  }))
}

const createGroupPostSchema = z.object({
  groupId: z.string().trim().min(1),
  content: z.string().trim().max(2000).optional().default(""),
  images: z.array(z.string()).max(4).optional().default([]),
})

export type CreateGroupPostResult = { success: true; postId: string } | { success: false; error: string }

export async function createGroupPost(input: unknown): Promise<CreateGroupPostResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = createGroupPostSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { groupId, content, images } = parsed.data
  if (!content.trim() && images.length === 0) return { success: false, error: "Write something or add media." }

  const membership = await db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId: session.user.id } } })
  if (!membership) return { success: false, error: "Join this group to post in it." }

  const post = await db.groupPost.create({ data: { groupId, authorId: session.user.id, content, images } })
  return { success: true, postId: post.id }
}

const groupPostIdSchema = z.object({ groupPostId: z.string().trim().min(1) })

export async function toggleGroupPostLike(input: unknown): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = groupPostIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { groupPostId } = parsed.data
  const userId = session.user.id

  const existing = await db.groupPostLike.findUnique({ where: { groupPostId_userId: { groupPostId, userId } } })
  if (existing) {
    const [, post] = await db.$transaction([
      db.groupPostLike.delete({ where: { id: existing.id } }),
      db.groupPost.update({ where: { id: groupPostId }, data: { likeCount: { decrement: 1 } } }),
    ])
    return { success: true, isActive: false, count: post.likeCount }
  }
  const [, post] = await db.$transaction([
    db.groupPostLike.create({ data: { groupPostId, userId } }),
    db.groupPost.update({ where: { id: groupPostId }, data: { likeCount: { increment: 1 } } }),
  ])
  return { success: true, isActive: true, count: post.likeCount }
}

export type GroupCommentItem = {
  id: string
  authorName: string
  authorAvatar: string | null
  content: string
  createdAt: string
  isMine: boolean
}

export async function getGroupPostComments(groupPostId: string): Promise<GroupCommentItem[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null
  const comments = await db.groupPostComment.findMany({ where: { groupPostId }, orderBy: { createdAt: "asc" }, include: { user: true } })
  return comments.map((c) => ({
    id: c.id,
    authorName: c.user.name,
    authorAvatar: c.user.image,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    isMine: myId === c.userId,
  }))
}

const addGroupCommentSchema = z.object({ groupPostId: z.string().trim().min(1), content: z.string().trim().min(1, "Write a comment") })

export async function addGroupPostComment(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = addGroupCommentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { groupPostId, content } = parsed.data

  await db.$transaction([
    db.groupPostComment.create({ data: { groupPostId, userId: session.user.id, content } }),
    db.groupPost.update({ where: { id: groupPostId }, data: { commentCount: { increment: 1 } } }),
  ])
  return { success: true }
}

export async function deleteGroupPost(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = groupPostIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  await db.groupPost.deleteMany({ where: { id: parsed.data.groupPostId, authorId: session.user.id } })
  return { success: true }
}

/** Creator-only: removes the group entirely (cascades memberships/posts). A
 * regular member should use toggleJoinGroup to leave instead. */
export async function deleteGroup(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = groupIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const group = await db.group.findUnique({ where: { id: parsed.data.groupId } })
  if (!group) return { success: false, error: "Group not found." }
  if (group.createdById !== session.user.id) return { success: false, error: "Only the group creator can delete this group." }

  await db.group.delete({ where: { id: group.id } })
  return { success: true }
}

export type TrendingTopic = { tag: string; postCount: number }

export async function getTrendingTopics(): Promise<TrendingTopic[]> {
  const posts = await db.post.findMany({ select: { content: true }, orderBy: { createdAt: "desc" }, take: 200 })
  const counts = new Map<string, number>()
  const hashtagRegex = /#(\w+)/g
  for (const post of posts) {
    for (const match of post.content.matchAll(hashtagRegex)) {
      const tag = `#${match[1]}`
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, postCount]) => ({ tag, postCount }))
}

export type SuggestedUser = { id: string; name: string; avatar: string | null; role: string; followerCount: number }

export async function getSuggestedUsers(): Promise<SuggestedUser[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null

  const followingIds = myId ? (await db.follow.findMany({ where: { followerId: myId } })).map((f) => f.followingId) : []

  const candidates = await db.user.findMany({
    where: {
      id: { notIn: [...followingIds, myId ?? ""] },
      role: { in: ["PROVIDER", "SHOPKEEPER"] },
    },
    include: { providerProfile: { include: { category: true } }, _count: { select: { followedBy: true } } },
    take: 20,
  })

  return candidates
    .sort((a, b) => b._count.followedBy - a._count.followedBy)
    .slice(0, 3)
    .map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.image,
      role: roleLabel(u.role, u.providerProfile?.category?.name),
      followerCount: u._count.followedBy,
    }))
}
