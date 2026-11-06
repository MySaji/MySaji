"use server"

import { z } from "zod"
import type { Prisma } from "@prisma/client"
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

const feedOptionsSchema = z.object({
  query: z.string().trim().max(200).default(""),
  view: z.enum(["all", "following", "mine", "unanswered"]).default("all"),
  mediaOnly: z.boolean().default(false),
  period: z.enum(["all", "week", "month"]).default("all"),
  before: z.object({ createdAt: z.string().datetime(), id: z.string().min(1).max(100) }).optional(),
})

export async function getPosts(postId?: string, savedOnly = false, options?: unknown): Promise<PostItem[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null
  if ((postId !== undefined && (typeof postId !== "string" || !postId.trim() || postId.length > 200)) || (savedOnly === true && !myId)) return []

  const parsed = options === undefined ? null : feedOptionsSchema.safeParse(options)
  if (parsed && !parsed.success) throw new Error("Check the community search filters.")
  const filters = parsed?.success ? parsed.data : null
  if (filters && !myId) throw new Error("Sign in to browse your community feed.")
  const AND: Prisma.PostWhereInput[] = []
  if (filters?.query) AND.push({ OR: [{content:{contains:filters.query,mode:"insensitive"}},{location:{contains:filters.query,mode:"insensitive"}},{author:{name:{contains:filters.query,mode:"insensitive"}}}] })
  if (filters?.view === "following") AND.push({ author: { followedBy: { some: { followerId: myId! } } } })
  if (filters?.view === "mine") AND.push({ authorId: myId! })
  if (filters?.view === "unanswered") AND.push({ commentCount: 0 })
  if (filters?.mediaOnly) AND.push({ OR: [{ images: { isEmpty: false } }, { video: { not: null } }] })
  if (filters && filters.period !== "all") AND.push({ createdAt:{gte:new Date(Date.now()-(filters.period==="week"?7:30)*86_400_000)} })
  if (filters?.before && !postId) AND.push({ OR:[{createdAt:{lt:new Date(filters.before.createdAt)}},{createdAt:new Date(filters.before.createdAt),id:{lt:filters.before.id}}] })
  const posts = await db.post.findMany({
    where: { isArchived: false, ...(postId ? { id: postId } : {}), ...(savedOnly === true && myId ? { saves: { some: { userId: myId } } } : {}), ...(AND.length ? {AND} : {}) },
    orderBy: [{createdAt:"desc"},{id:"desc"}],
    take: filters ? 31 : 50,
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

const addCommentSchema = z.object({ postId: z.string().trim().min(1), content: z.string().trim().min(1, "Write a comment").max(2000) })

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

const postImageSchema = z.string().max(1_400_000).refine(value => {
  if (/^https:\/\/[^\s]+$/i.test(value)) return value.length <= 4096
  const match = /^data:image\/(?:jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  return !!match && Buffer.from(match[1], "base64").byteLength <= 1024 * 1024
}, "Use a supported image up to 1 MB.")
const postVideoSchema = z.string().max(4_200_000).refine(value => {
  if (/^https:\/\/[^\s]+$/i.test(value)) return value.length <= 4096
  const match = /^data:video\/(?:mp4|webm|quicktime);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  return !!match && Buffer.from(match[1], "base64").byteLength <= 3 * 1024 * 1024
}, "Use a supported video up to 3 MB.")
const createPostSchema = z.object({
  content: z.string().trim().max(2000).optional().default(""),
  images: z.array(postImageSchema).max(4).optional().default([]),
  video: postVideoSchema.optional(),
  location: z.string().trim().max(150).optional(),
})

export type CreatePostResult = { success: true; postId: string } | { success: false; error: string }

export async function createPost(input: unknown): Promise<CreatePostResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = createPostSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
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

export async function editMyCommunityPost(input: unknown): Promise<CommunityActionResult> {
  const session=await auth()
  if(!session?.user?.id)return {success:false,error:"Sign in to edit your post."}
  const parsed=z.object({postId:z.string().min(1).max(100),content:z.string().trim().max(2000),expectedContent:z.string().max(2000)}).safeParse(input)
  if(!parsed.success)return {success:false,error:"Keep your post within 2,000 characters."}
  const d=parsed.data
  const post=await db.post.findFirst({where:{id:d.postId,authorId:session.user.id,isArchived:false},select:{images:true,video:true}})
  if(!post)return {success:false,error:"Only the author can edit an available post."}
  if(!d.content&&!post.images.length&&!post.video)return {success:false,error:"Write something or keep the attached media."}
  const changed=await db.post.updateMany({where:{id:d.postId,authorId:session.user.id,isArchived:false,content:d.expectedContent},data:{content:d.content}})
  return changed.count===1?{success:true}:{success:false,error:"This post changed. Refresh before editing again."}
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
  isCreator: boolean
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
    isCreator: g.createdById === myId,
  }))
}

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().min(1, "Description is required").max(1000),
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

  const group=await db.group.findUnique({where:{id:groupId},select:{createdById:true}})
  if(!group)return {success:false,error:"This group is no longer available."}
  const existing = await db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } })
  if(existing&&group.createdById===userId)return {success:false,error:"The group creator keeps their membership. Use group settings to manage or delete your group."}
  if (existing) {
    await db.groupMembership.delete({ where: { id: existing.id } })
  } else {
    await db.groupMembership.create({ data: { groupId, userId, isAdmin: group.createdById===userId } })
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

export async function updateMyCommunityGroup(input: unknown): Promise<CommunityActionResult> {
  const session=await auth()
  if(!session?.user?.id)return {success:false,error:"Sign in to manage your group."}
  const parsed=z.object({groupId:z.string().min(1).max(100),name:z.string().trim().min(2).max(100),description:z.string().trim().min(1).max(1000),expectedName:z.string().max(100),expectedDescription:z.string().max(1000).nullable()}).safeParse(input)
  if(!parsed.success)return {success:false,error:"Enter a name (2-100 characters) and description (up to 1,000 characters)."}
  const d=parsed.data
  const result=await db.group.updateMany({where:{id:d.groupId,createdById:session.user.id,name:d.expectedName,description:d.expectedDescription},data:{name:d.name,description:d.description}})
  return result.count===1?{success:true}:{success:false,error:"Only the creator can update an unchanged group. Refresh and try again."}
}

export type GroupMemberItem = { id: string; name: string; avatar: string | null; isAdmin: boolean; joinedAt: string }

export async function getGroupMembers(groupId: string): Promise<GroupMemberItem[]> {
  if(!(await auth())?.user?.id)return []
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

export async function getGroupPosts(groupId: string, before?: { createdAt: string; id: string }): Promise<GroupPostItem[]> {
  const session = await auth()
  const myId = session?.user?.id ?? null

  if(!z.string().min(1).max(100).safeParse(groupId).success || before && !z.object({createdAt:z.string().datetime(),id:z.string().min(1).max(100)}).safeParse(before).success) return []
  const posts = await db.groupPost.findMany({
    where: { groupId, ...(before?{OR:[{createdAt:{lt:new Date(before.createdAt)}},{createdAt:new Date(before.createdAt),id:{lt:before.id}}]}:{}) },
    orderBy: [{createdAt:"desc"},{id:"desc"}],
    take: 31,
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
  images: z.array(postImageSchema).max(4).optional().default([]),
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

  const target=await db.groupPost.findUnique({where:{id:groupPostId},select:{groupId:true}})
  if(!target||!await db.groupMembership.findUnique({where:{groupId_userId:{groupId:target.groupId,userId}}}))return {success:false,error:"Join this group before reacting to its posts."}
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

const addGroupCommentSchema = z.object({ groupPostId: z.string().trim().min(1), content: z.string().trim().min(1, "Write a comment").max(2000) })

export async function addGroupPostComment(input: unknown): Promise<CommunityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = addGroupCommentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { groupPostId, content } = parsed.data

  const target=await db.groupPost.findUnique({where:{id:groupPostId},select:{groupId:true}})
  if(!target||!await db.groupMembership.findUnique({where:{groupId_userId:{groupId:target.groupId,userId:session.user.id}}}))return {success:false,error:"Join this group before adding a comment."}
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
  const posts = await db.post.findMany({ where: {isArchived:false}, select: { content: true }, orderBy: { createdAt: "desc" }, take: 200 })
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
