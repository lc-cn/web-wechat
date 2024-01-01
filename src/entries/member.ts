import {Contact} from "@/entries/contact";
import {Client} from "@/client";
const memberCache:WeakMap<Member.Info,Member>=new WeakMap<Member.Info, Member>()
export class Member extends Contact{
    group_id:string
    user_id:string
    nickname:string
    get is_self(){
        return this.client.info.username===this.user_id
    }
    get group(){
        return this.client.pickGroup(this.group_id)
    }
    constructor(c:Client,info:Member.Info) {
        super(c,info);
        this.group_id = info.group_id
        this.user_id=info.user_id
        this.nickname=info.nickname
    }
    static from(this:Client,group_id:string,user_id:string){
        const memberInfo=this.gml.get(group_id).get(user_id)
        let member=memberCache.get(memberInfo)
        if(!member) memberCache.set(memberInfo,member=new Member(this,memberInfo))
        return member
    }
}
export namespace Member{
    export interface OriginalInfo{
        Uin:number
        UserName:string
        NickName:string
    }
    export interface Info extends Contact.Info{
        user_id:string
        group_id:string
        nickname:string
    }
}
