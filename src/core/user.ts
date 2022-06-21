import {Contactable} from "./contact";
import {Client} from "../client";
import {lock} from "../common";
import {MessageRet, Sendable} from "../message/elements";
export interface UserInfo{
    id:string
    nick_name:string
    alias_name:string
    sex:'0'|'1'
    head_big_image_url:string
    head_small_image_url:string
}
export class User extends Contactable{
    static as(this:Client,id:string){
        return new User(this,id)
    }
    /** 返回作为好友的实例 */
    asFriend(strict = false) {
        return this.c.pickFriend(this.uid, strict)
    }

    /** 返回作为某群群员的实例 */
    asMember(gid: number, strict = false) {
        return this.c.pickMember(gid, this.uid, strict)
    }
    constructor(c:Client,public readonly uid:string) {
        super(c);
        lock(this,'uid')
    }
    async sendMsg(msg:Sendable){
        if(typeof msg === 'string'){
            msg = {type:'text',content:msg}
        }
        const {type,...params}=msg
        const res=await this.c._callApi(`/message/send/${type}`, {to:this.uid,...params},'post').then(res=>res.data||{})
        return res as MessageRet
    }
}
