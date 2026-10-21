const {test}=require('node:test')
const assert=require('node:assert/strict')
const {loadService}=require('./load-service.cjs')
const templates=loadService('backend/services/email-templates.ts',{}, {URL})

test('branded emails use responsive tables, plain blue/orange colours and accessible verification codes',()=>{
 const html=templates.wrapEmailLayout({title:'Verify <account>',bodyHtml:templates.otpCodeBlock('123456'),previewText:'Your sign-in code',unsubscribeUrl:'https://mysaji.com/unsubscribe?token=a&source=email'})
 assert.match(html,/role="presentation"/)
 assert.match(html,/data-saji-email="true"/)
 assert.match(html,/Verify &lt;account&gt;/)
 assert.match(html,/123456/)
 assert.match(html,/@media\(max-width:620px\)/)
 assert.match(html,/#0647b5/)
 assert.match(html,/#ff8a17/)
 assert.doesNotMatch(html,/linear-gradient/)
 assert.match(html,/token=a&amp;source=email/)
 assert.match(html,/YOUR VERIFICATION CODE/)
})
test('email buttons escape their label and reject executable URL schemes',()=>{
 assert.match(templates.emailButton('<Go>', 'https://mysaji.com/customer/home'),/&lt;Go&gt;/)
 assert.match(templates.emailButton('Go','javascript:alert(1)'),/href="#"/)
 assert.doesNotMatch(templates.wrapEmailLayout({title:'Test',bodyHtml:'<p>Hello</p>'}),/>Unsubscribe/)
 assert.match(templates.otpCodeBlock('<script>'),/&lt;script&gt;/)
})
test('the email logo is served by the site itself, not Supabase Storage',()=>{
 const previous=process.env.NEXT_PUBLIC_SITE_URL
 process.env.NEXT_PUBLIC_SITE_URL='https://mysaji.com'
 try{
  const html=templates.wrapEmailLayout({title:'Hello',bodyHtml:'<p>Hi</p>'})
  assert.match(html,/<img src="https:\/\/mysaji\.com\/email-logo\.png"/)
  assert.doesNotMatch(html,/supabase/i)
 }finally{
  if(previous===undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL=previous
 }
})
test('the email logo URL is always absolute HTTPS on a publicly reachable origin',()=>{
 const keys=['EMAIL_SITE_URL','NEXT_PUBLIC_SITE_URL','NEXTAUTH_URL','CALLBACK_URL']
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 const withOrigin=(value)=>{ keys.forEach(k=>delete process.env[k]); if(value!==undefined) process.env.NEXT_PUBLIC_SITE_URL=value; return templates.emailLogoUrl() }
 try{
  assert.equal(withOrigin('https://mysaji.com'),'https://mysaji.com/email-logo.png')
  assert.equal(withOrigin('https://staging.mysaji.com/'),'https://staging.mysaji.com/email-logo.png')
  assert.equal(withOrigin('http://127.0.0.1:13001'),'https://mysaji.com/email-logo.png')
  assert.equal(withOrigin('not a url'),'https://mysaji.com/email-logo.png')
  assert.equal(withOrigin(undefined),'https://mysaji.com/email-logo.png')
 }finally{
  keys.forEach(k=>{ if(previous[k]===undefined) delete process.env[k]; else process.env[k]=previous[k] })
 }
})
