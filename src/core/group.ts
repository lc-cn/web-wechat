import {Contactable} from "./contact";
import {Client} from "../client";
import {hide, lock} from "../common";
import {MessageRet, Sendable} from "../message/elements";
export interface GroupInfo{
    wx_id:`${number}@chatroom`
    nick_name:string
    owner:string
    member_num:number
    head_small_image_url:string
    status:string
    admins:string[]
    members:string[]
}
const weakMap = new WeakMap<GroupInfo, Group>()
export class Group extends Contactable{
    static as(this:Client,gid:string,strict?:boolean){
        const info = this.gl.get(gid)
        if (strict && !info)
            throw new Error(`你尚未加入群` + gid)
        let group = weakMap.get(info!)
        if (group) return group
        group = new Group(this, gid, info)
        if (info)
            weakMap.set(info, group)
        return group
    }
    constructor(c:Client,public readonly gid:string,private info?:GroupInfo) {
        super(c);
        lock(this,'gid')
        hide(this, "_info")
    }
    /** 获取一枚群员实例 */
    pickMember(uid: string, strict = false) {
        return this.c.pickMember(this.gid, uid, strict)
    }
    getMemberList(){
        return this.c.gml.get(this.gid)
    }
    async sendMsg(msg:Sendable){
        if(typeof msg === 'string'){
            msg = {type:'text',content:msg}
        }
        const {type,...params}=msg
        const res=await this.c._callApi(`/message/send/${type}`, {to:this.gid,...params},'post').then(res=>res.data||{})
        return res as MessageRet
    }
}
