const {test}=require('node:test')
const assert=require('node:assert/strict')
const {loadService}=require('./load-service.cjs')
const domain=loadService('backend/domain/workspace-personalization.ts')
test('workspace scope follows signed-in roles, with shared Pro roots only',()=>{
 for(const root of domain.WORKSPACE_ROOTS){assert.equal(domain.workspaceScope('/'+root+'/messages',root),root);assert.equal(domain.workspaceScope('/'+root,'customer'),null)}
 assert.equal(domain.workspaceScope('/provider/jobs','shopkeeper'),'provider')
 assert.equal(domain.workspaceScope('/admin/users','agent'),null)
})
test('saved navigation rejects cross-role, external, traversal and admin wallet destinations',()=>{
 for(const href of ['https://example.com','//evil.com','/agent/disputes','/admin/wallet','/admin/wallet/history','/admin/../customer','/admin/%2e%2e/customer','/admin\\users','/admin/ users'])assert.equal(domain.safeWorkspaceHref(href,'admin'),null,href)
 assert.equal(domain.safeWorkspaceHref('/admin/users?search=private#record','admin'),'/admin/users')
 assert.equal(domain.safeWorkspaceHref('/shopkeeper/orders','provider'),'/shopkeeper/orders')
})
test('stored pins only expose currently permitted navigation, with deduplication',()=>{
 const allowed=[{href:'/provider/jobs',label:'Jobs'}]
 const saved=domain.permittedSavedLinks(['/provider/wallet','/provider/jobs','/provider/jobs','//evil.com'],allowed)
 assert.equal(saved.length,1);assert.equal(saved[0].href,'/provider/jobs')
 assert.equal(domain.permittedSavedLinks(saved,[]).length,0)
})
test('personal tasks validate untrusted browser state and exclude extra payloads',()=>{
 const task={id:'one',title:'  Review cases  ',done:false,due:'2026-11-06',createdAt:'2026-11-06T10:00:00Z',secret:'discard'}
 const rows=domain.readPersonalTasks([task,task,{...task,id:'two',due:'2026-02-30'},{...task,id:'three',done:'yes'},null])
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Review cases');assert.equal(rows[0].secret,undefined)
 assert.equal(domain.readPersonalTasks(Array.from({length:60},(_,id)=>({...task,id:String(id)}))).length,50)
})
test('dates validate calendar days and include both EAT dates with exclusive end',()=>{
 assert.equal(domain.validDay('2026-02-30'),false);assert.equal(domain.validDay('2028-02-29'),true)
 const range=domain.activityDateRange('2026-11-01','2026-11-02')
 assert.equal(range.start.toISOString(),'2026-10-31T21:00:00.000Z');assert.equal(range.end.toISOString(),'2026-11-02T21:00:00.000Z')
 assert.equal(domain.activityDateRange('2026-11-02','2026-11-01'),null)
 assert.equal(domain.activityDateRange('2024-01-01','2026-11-01'),null)
 assert.equal(domain.eastAfricaDay(Date.parse('2026-11-05T22:00:00Z')),'2026-11-06')
})
function activity(options={}){
 const reads=[]
 const db={user:{findFirst:async q=>{reads.push(['member',q]);return options.missing?null:{id:'staff',name:'Mary',role:'AGENT',teamProfile:{jobTitle:'Support agent',department:'Care'}}}},auditLog:{count:async q=>{reads.push(['count',q]);return 60},findMany:async q=>{reads.push(['entries',q]);return Array.from({length:options.empty?0:51},(_,i)=>({id:String(100-i),action:'dispute.resolve',entityType:'Dispute',createdAt:new Date('2026-11-05T10:00:00Z')}))}}}
 const actions=loadService('backend/actions/admin-team-activity.ts',{'zod':require('zod'),'@/backend/db':{db},'@/backend/actions/admin-dashboard':{requireAdmin:async()=>options.denied?null:{userId:'admin'}},'@/backend/domain/workspace-personalization':domain})
 return{...actions,reads}
}
const request={userId:'staff',from:'2026-11-01',to:'2026-11-06'}
test('staff activity rejects non-admin access before any database query',async()=>{
 const s=activity({denied:true});assert.equal((await s.getAdminTeamActivity(request)).success,false);assert.equal(s.reads.length,0)
})
test('staff activity requires a real team role and valid bounded dates',async()=>{
 const s=activity();assert.equal((await s.getAdminTeamActivity({...request,to:'2026-02-30'})).success,false);assert.equal(s.reads.length,0)
 const missing=activity({missing:true});assert.equal((await missing.getAdminTeamActivity(request)).success,false);assert.equal(missing.reads.length,1)
 const q=missing.reads[0][1];assert.equal(q.where.deletedAt,null);assert.equal(q.where.role.in.join(','),'SUB_ADMIN,SECRETARY,AGENT')
})
test('staff activity paginates stably and selects only non-sensitive audit summary fields',async()=>{
 const s=activity();const result=await s.getAdminTeamActivity({...request,before:{id:'prior',createdAt:'2026-11-05T12:00:00Z'}})
 assert.equal(result.success,true);assert.equal(result.data.entries.length,50);assert.equal(result.data.total,60);assert.equal(result.data.next.id,'51')
 const q=s.reads.find(([name])=>name==='entries')[1]
 assert.equal(q.where.userId,'staff');assert.equal(q.where.createdAt.gte.toISOString(),'2026-10-31T21:00:00.000Z');assert.equal(q.where.createdAt.lt.toISOString(),'2026-11-06T21:00:00.000Z')
 assert.equal(q.take,51);assert.equal(q.orderBy[1].id,'desc');assert.equal(q.where.OR[1].id.lt,'prior')
 assert.equal(Object.keys(q.select).sort().join(','),'action,createdAt,entityType,id');assert.equal(result.data.entries[0].oldValues,undefined)
})
