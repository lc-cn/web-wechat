import {Contact} from "@/entries/contact";
import {Client} from "@/client";
import {Member} from "@/entries/member";
const groupCache:WeakMap<Group.Info,Group>=new WeakMap<Group.Info, Group>()
export class Group extends Contact{
    group_id:string
    static from(this:Client,group_id:string){
        const groupInfo=this.gl.get(group_id)
        let group=groupCache.get(groupInfo)
        if(!group) groupCache.set(groupInfo,group=new Group(this,groupInfo))
        return group
    }
    get group_name(){
        return this.info.nickname
    }
    get member_count(){
        return this.client.gml.get(this.group_id).size
    }
    getMemberList(){
        return Array.from(this.client.gml.get(this.group_id).values())
    }
    getMemberInfo(member_id:string){
        return this.client.gml.get(this.group_id)?.get(member_id)
    }
    pickMember(member_id:string){
        return Member.from.apply(this.client,[this.group_id,member_id])
    }
    constructor(c:Client,info:Group.Info) {
        super(c,info);
        this.group_id=info.group_id
    }
}
export namespace Group{
    export interface Info extends Contact.Info{
        group_id:string
        group_name:string
        member_count:number
    }
}
