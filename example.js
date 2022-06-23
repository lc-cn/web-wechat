const {Client} = require("./lib");
const client=new Client('wxid_ory0kg6rygyk22',{log_level:'debug'})
client.login()
client.on('message',(e)=>{
  if(e.content==='ping'){
    e.reply('pong')
  }
  if(e.content==='你好'){
    e.reply('你好呀')
  }
})
process.stdin.on('data',()=>{})

