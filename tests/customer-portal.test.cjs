const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const{loadService}=require('./load-service.cjs');
function community(options={}){
 const reads=[],writes=[];const user=options.signedOut?null:{user:{id:'me'}};
 const db={post:{findMany:async q=>{reads.push(q);return[]},findFirst:async q=>{reads.push(q);return options.notOwner?null:{images:[],video:null}},updateMany:async q=>{writes.push(q);return{count:options.stale?0:1}}},
 group:{findUnique:async()=>({createdById:'me'}),updateMany:async q=>{writes.push(q);return{count:options.stale?0:1}}},
 groupPost:{findMany:async q=>{reads.push(q);return[]},findUnique:async()=>({groupId:'group'}),create:async q=>{writes.push(q);return{id:'created'}}},
 groupMembership:{findUnique:async()=>options.member?{id:'membership'}:null,create:async q=>{writes.push(q);return{id:'membership'}},count:async()=>1},$transaction:async()=>{writes.push('transaction');return[]}}
 const actions=loadService('backend/actions/community.ts',{zod:require('zod'),'@/backend/auth':{auth:async()=>user},'@/backend/db':{db}})
 return{...actions,reads,writes}
}
test('customer route context covers every customer page and related links lead to real pages',()=>{
 const {customerSection,CUSTOMER_SECTIONS}=loadService('backend/domain/customer-navigation.ts');let count=0
 function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const filename=path.join(dir,entry.name);if(entry.isDirectory())visit(filename);else if(entry.name==='page.tsx'){count++;const route='/customer/'+path.relative('app/customer',dir).split(path.sep).join('/');assert.ok(customerSection(route),route)}}}
 visit('app/customer');assert.ok(count>=40)
 for(const section of CUSTOMER_SECTIONS)for(const key of section.related)assert.ok(fs.existsSync(`app/customer/${key}/page.tsx`),key)
 assert.equal(customerSection('/admin/home'),null)
})
test('community search uses server filters and a stable date/id cursor while excluding archived content',async()=>{
 const s=community();await s.getPosts(undefined,true,{query:'plumber',view:'following',mediaOnly:true,period:'week',before:{id:'last',createdAt:'2026-11-01T12:00:00.000Z'}})
 const q=s.reads[0];assert.equal(q.take,31);assert.equal(q.where.isArchived,false);assert.equal(q.where.saves.some.userId,'me');assert.equal(q.orderBy[1].id,'desc');assert.ok(q.where.AND.some(filter=>filter.author?.followedBy?.some?.followerId==='me'));assert.ok(q.where.AND.some(filter=>filter.OR?.some(part=>part.id?.lt==='last')));assert.ok(q.where.AND.some(filter=>filter.OR?.some(part=>part.content?.contains==='plumber')))
 const mine=community();await mine.getPosts(undefined,false,{view:'mine'});assert.equal(mine.reads[0].where.AND[0].authorId,'me')
 const replies=community();await replies.getPosts(undefined,false,{view:'unanswered'});assert.equal(replies.reads[0].where.AND[0].commentCount,0)
 await assert.rejects(()=>s.getPosts(undefined,false,{query:'a'.repeat(201)}));const signedOut=community({signedOut:true});await assert.rejects(()=>signedOut.getPosts(undefined,false,{view:'mine'}));assert.equal(signedOut.reads.length,0)
})
test('own post edits preserve attachments and compare previous text to prevent stale or foreign writes',async()=>{
 const input={postId:'post',content:'Updated advice',expectedContent:'Old advice'}
 const foreign=community({notOwner:true});assert.equal((await foreign.editMyCommunityPost(input)).success,false);assert.equal(foreign.writes.length,0)
 const stale=community({stale:true});assert.equal((await stale.editMyCommunityPost(input)).success,false)
 const s=community();assert.equal((await s.editMyCommunityPost(input)).success,true);assert.equal(s.writes[0].where.authorId,'me');assert.equal(s.writes[0].where.content,'Old advice');assert.deepEqual(Object.keys(s.writes[0].data),['content']);assert.equal((await s.editMyCommunityPost({...input,content:''})).success,false)
})
test('group reactions, comments and uploads enforce membership and media limits before writes',async()=>{
 const s=community();assert.equal((await s.toggleGroupPostLike({groupPostId:'post'})).success,false);assert.equal((await s.addGroupPostComment({groupPostId:'post',content:'A helpful reply'})).success,false);assert.equal(s.writes.length,0)
 const member=community({member:true});assert.equal((await member.createGroupPost({groupId:'group',images:['data:image/svg+xml;base64,PHN2Zz4=']})).success,false);assert.equal(member.writes.length,0);assert.equal((await member.addGroupPostComment({groupPostId:'post',content:'a'.repeat(2001)})).success,false)
 assert.equal((await community({member:true}).toggleJoinGroup({groupId:'group'})).success,false,'creator cannot orphan the group by leaving');const legacy=community();assert.equal((await legacy.toggleJoinGroup({groupId:'group'})).success,true);assert.equal(legacy.writes[0].data.isAdmin,true,'a creator who left an older group can restore their membership')
 const paged=community();await paged.getGroupPosts('group',{id:'older',createdAt:'2026-11-01T12:00:00.000Z'});assert.equal(paged.reads[0].take,31);assert.equal(paged.reads[0].orderBy[1].id,'desc')
})
test('group settings are creator-scoped and reject stale snapshots',async()=>{
 const s=community();const input={groupId:'group',name:'Neighbourhood help',description:'Useful local advice',expectedName:'Old group',expectedDescription:null};assert.equal((await s.updateMyCommunityGroup(input)).success,true);assert.equal(s.writes[0].where.createdById,'me');assert.equal(s.writes[0].where.name,'Old group');assert.equal((await community({stale:true}).updateMyCommunityGroup(input)).success,false);assert.equal((await community({signedOut:true}).updateMyCommunityGroup(input)).success,false)
})
test('wishlist explicit state retries never toggle a removed item back on or create duplicates',async()=>{
 let saved=false,writes=0;const queries=[];const tx={$queryRaw:async q=>assert.match(q[0],/SELECT true AS locked/),wishlistItem:{findFirst:async q=>{queries.push(q);return saved?{id:'saved'}:null},create:async()=>{saved=true;writes++},deleteMany:async q=>{queries.push(q);saved=false;return{count:1}}}}
 const actions=loadService('backend/actions/wishlist.ts',{zod:require('zod'),'@/backend/auth':{auth:async()=>({user:{id:'customer'}})},'@/backend/db':{db:{$transaction:async fn=>fn(tx)}}})
 for(let i=0;i<2;i++)assert.equal((await actions.setWishlistSaved({targetType:'SHOP',targetId:'shop',saved:true})).success,true)
 assert.equal(writes,1);assert.equal(saved,true)
 for(let i=0;i<2;i++)await actions.setWishlistSaved({targetType:'SHOP',targetId:'shop',saved:false})
 assert.equal(saved,false);assert.ok(queries.every(q=>q.where.customerId==='customer'))
})
test('editing a manual address can clear old GPS coordinates and remains scoped to its owner',async()=>{
 let update;const actions=loadService('backend/actions/addresses.ts',{zod:require('zod'),'@/backend/auth':{auth:async()=>({user:{id:'me'}})},'@/backend/db':{db:{address:{updateMany:async q=>{update=q;return{count:1}}}}}})
 const result=await actions.updateAddress({id:'address',label:'Office',address:'New building',type:'OFFICE',city:null,latitude:null,longitude:null});assert.equal(result.success,true);assert.equal(update.where.userId,'me');assert.equal(update.data.latitude,null);assert.equal(update.data.longitude,null);assert.equal(update.data.city,null)
})
