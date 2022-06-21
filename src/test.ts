import {Client} from "./client";
const client=new Client('http://49.234.86.244:8080/',{log_level:'debug'})
client.login()
client.on('system.ready',async ()=>{
    await client.sendPrivateMsg('wxid_ory0kg6rygyk22','hello')
    await client.sendGroupMsg('17419453727@chatroom','test msg')
})
process.stdin.on('data',(data)=>{})

