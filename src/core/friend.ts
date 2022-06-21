import {User, UserInfo} from "./user";
import {Client} from "../client";
import {hide} from "../common";
export interface FriendInfo extends UserInfo{
    country:string
    province:string
    city:string
    signature:string
    label:string
    friend:boolean
    is_admin:boolean
}
const weakMap = new WeakMap<FriendInfo, Friend>()
export class Friend extends User{
    static as(this:Client,uid:string){
        const info = this.fl.get(uid)
        if (!info)
            throw new Error(uid + `不是你的好友`)
        let friend = weakMap.get(info!)
        if (friend) return friend
        friend = new Friend(this, uid, info)
        if (info)
            weakMap.set(info, friend)
        return friend
    }
    constructor(c:Client,id:string,_info?:FriendInfo){
        super(c,id);
        hide(this,'_info')
    }
}
