const {test}=require('node:test')
const assert=require('node:assert/strict')
const {loadService}=require('./load-service.cjs')
const domain=loadService('backend/domain/map-provider.ts')
function setup(options={}) {
 const env={OSM_TILE_URL:'https://tiles.example/{z}/{x}/{y}.png',OSM_GEOCODER_URL:'https://geo.example/',OSM_GEOCODER_API_KEY:'server-secret',NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:'browser-key',...options.env}
 let setting=options.setting??null,admin=options.admin===false?null:{userId:'admin'},writes=[],audits=[],requests=[]
 const db={platformSetting:{findUnique:async q=>{assert.equal(q.where.key,'maps');if(options.dbFailure)throw Error('database offline');return setting},upsert:async q=>{writes.push(q);setting={value:q.update.value};return setting}}}
 const geocoder=loadService('backend/services/osm-geocoding.ts',{'@/backend/domain/map-provider':domain},{process:{env},URL,AbortSignal,fetch:async(url,init)=>{requests.push({url:String(url),init});return{ok:true,json:async()=>options.geoResult??[{lat:'-1.28',lon:'36.81',display_name:'Nairobi',address:{city:'Nairobi'}}]}}})
 const service=loadService('backend/services/map-settings.ts',{'@/backend/db':{db},'@/backend/domain/map-provider':domain,'@/backend/services/osm-geocoding':geocoder},{process:{env}})
 const actions=loadService('backend/actions/admin-maps.ts',{zod:require('zod'),'@/backend/db':{db},'@/backend/actions/admin-dashboard':{requireAdmin:async()=>admin},'@/backend/services/admin-audit-core':{logAdminAction:async e=>audits.push(e)},'@/backend/services/map-settings':service},{process:{env}})
 const routes=loadService('app/api/maps/config/route.ts',{'@/backend/services/map-settings':service},{Response})
 const geocodeRoute=loadService('app/api/maps/geocode/route.ts',{'@/backend/auth':{auth:async()=>options.signedOut?null:{user:{id:'customer'}}},'@/backend/services/map-settings':service,'@/backend/services/osm-geocoding':geocoder,'@/backend/domain/map-provider':domain,'@/backend/services/rate-limit':{checkRateLimit:async()=>({allowed:!options.limited})}},{URL,Response})
 return {domain,service,actions,routes,geocodeRoute,geocoder,writes,audits,requests,setAdmin:value=>{admin=value},getSetting:()=>setting}
}
test('maps default to Google and public configuration exposes no geocoder URL or credential',async()=>{
 const s=setup();const config=await s.service.loadMapConfig();assert.equal(config.provider,'GOOGLE');assert.equal(config.osmSearchConfigured,true);assert.equal(JSON.stringify(config).includes('server-secret'),false);assert.equal(JSON.stringify(config).includes('geo.example'),false)
 assert.equal(domain.readMapProvider({provider:'BAD'}),'GOOGLE');assert.equal(domain.readMapProvider({provider:'OPENSTREETMAP'}),'OPENSTREETMAP')
 assert.equal(domain.validCoordinates(0,0),true);assert.equal(domain.validCoordinates(-91,36),false);assert.equal(domain.validCoordinates(1,Infinity),false)
 const response=await s.routes.GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
})
test('only admins can change maps and changes are isolated from general platform settings and audited',async()=>{
 const s=setup({admin:false});assert.equal((await s.actions.getAdminMapSettings()).success,false);assert.equal((await s.actions.updateAdminMapSettings({provider:'OPENSTREETMAP'})).success,false);assert.equal(s.writes.length,0)
 s.setAdmin({userId:'admin'});assert.equal((await s.actions.updateAdminMapSettings({provider:'BAD'})).success,false);assert.equal(s.writes.length,0)
 assert.equal((await s.actions.updateAdminMapSettings({provider:'OPENSTREETMAP'})).success,true);assert.equal(s.writes[0].where.key,'maps');assert.deepEqual(JSON.parse(JSON.stringify(s.getSetting().value)),{provider:'OPENSTREETMAP'});assert.equal(s.audits[0].action,'map_provider.update')
 assert.equal((await s.actions.updateAdminMapSettings({provider:'GOOGLE'})).success,true);assert.equal((await s.service.loadMapConfig()).provider,'GOOGLE')
})
test('missing Google key blocks activation and DB outages return a retryable error instead of switching providers',async()=>{
 const s=setup({env:{NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:''}});assert.equal((await s.actions.updateAdminMapSettings({provider:'GOOGLE'})).success,false);assert.equal(s.writes.length,0)
 const broken=setup({dbFailure:true});assert.equal((await broken.routes.GET()).status,503);assert.equal((await broken.actions.getAdminMapSettings()).success,false)
})
test('OSM address lookup is optional and public Nominatim is never used implicitly',async()=>{
 for(const value of ['', 'http://geo.example','https://nominatim.openstreetmap.org','https://x.nominatim.openstreetmap.org','not a url']){const s=setup({env:{OSM_GEOCODER_URL:value}});assert.equal((await s.service.loadMapConfig()).osmSearchConfigured,false);await assert.rejects(()=>s.geocoder.lookupOsmPlace({query:'Nairobi'}));assert.equal(s.requests.length,0)}
})
test('geocoding requires login, OSM selection, valid coordinates and rate-limit approval',async()=>{
 for(const options of [{signedOut:true},{limited:true},{setting:{value:{provider:'GOOGLE'}}},{env:{OSM_GEOCODER_URL:''}}]){const s=setup({setting:{value:{provider:'OPENSTREETMAP'}},...options});const response=await s.geocodeRoute.GET(new Request('https://mysaji.com/api/maps/geocode?q=Nairobi'));assert.notEqual(response.status,200);assert.equal(s.requests.length,0)}
 const s=setup({setting:{value:{provider:'OPENSTREETMAP'}}});for(const query of ['lat=91&lng=36','lat=&lng=','q=ab']){const r=await s.geocodeRoute.GET(new Request(`https://mysaji.com/api/maps/geocode?${query}`));assert.equal(r.status,400)}
})
test('configured lookup uses server-only credentials and returns provider-neutral coordinates',async()=>{
 const s=setup({setting:{value:{provider:'OPENSTREETMAP'}}});const response=await s.geocodeRoute.GET(new Request('https://mysaji.com/api/maps/geocode?q=Nairobi'));assert.equal(response.status,200)
 const body=await response.json();assert.equal(body.places[0].latitude,-1.28);assert.equal(body.places[0].address,'Nairobi');assert.equal(JSON.stringify(body).includes('server-secret'),false);assert.match(s.requests[0].url,/\/search\?/);assert.equal(s.requests[0].init.headers.Authorization,'Bearer server-secret');assert.equal(s.requests[0].init.redirect,'error')
 await s.geocodeRoute.GET(new Request('https://mysaji.com/api/maps/geocode?lat=-1.28&lng=36.81'));assert.match(s.requests[1].url,/\/reverse\?/)
})
