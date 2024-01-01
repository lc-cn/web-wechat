import {Client} from "@/client";
export class Request{

}
export class FriendRequestEvent extends Request{
    ticket:string
    user_id:string
    nickname:string
    constructor(private c: Client, recommend: Request.Friend) {
        super()
        this.ticket=recommend.ticket
        this.user_id=recommend.user_id
        this.nickname=recommend.nickname
    }
    async approve(){
        const {data}=await this.c.request({
            url:'/cgi-bin/mmwebwx-bin/webwxverifyuser',
            method:'POST',
            params:{
                'pass_ticket': this.c.session.passTicket,
                'lang': 'zh_CN'
            },
            data:{
                'BaseRequest': this.c.getBaseRequest(),
                'Opcode': 3,
                'VerifyUserListSize': 1,
                'VerifyUserList': [{
                    'Value': this,
                    'VerifyUserTicket': this.ticket
                }],
                'VerifyContent': '',
                'SceneListCount': 1,
                'SceneList': [33],
                'skey': this.c.session.skey
            }
        })
        return data.BaseResponse.Ret===0
    }
}
export namespace Request{
    export interface Friend{
        user_id:string
        nickname:string
        ticket:string
    }
}
