import {Client} from "./client";
import {Message} from "./message";
// 传入微信id，获取方式见 https://jingyan.baidu.com/article/647f0115cf7e953e2048a85a.html
const client=new Client('wxid_xxxxxxxxxxxxx',{log_level:'debug'})
client.login()
// 消息监听
client.on('message',(e:Message)=>{
  if(e.content==='ping'){
    e.reply('pong')
  }
  if(e.content==='你好'){
    e.reply('你好呀')
  }
})
process.stdin.on('data',()=>{})

