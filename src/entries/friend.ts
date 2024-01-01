import {Contact} from "@/entries/contact";
import {Client} from "@/client";
import {Sex} from "@/core/constanst";
const friendCache:WeakMap<Friend.Info,Friend>=new WeakMap<Friend.Info,Friend>();
export class Friend extends Contact{
    user_id:string
    get is_self(){
        return this.client.info.username===this.user_id
    }
    sex:Sex
    constructor(c:Client,info:Friend.Info) {
        super(c,info);
        this.user_id=info.user_id
        this.sex=info.sex
    }
    static from(this:Client,user_id:string){
        const friendInfo=this.fl.get(user_id)
        let friend=friendCache.get(friendInfo)
        if(!friend) friendCache.set(friendInfo,friend=new Friend(this,friendInfo))
        return friend
    }
}
export namespace Friend{
    export interface Info extends Contact.Info{
        user_id:string;
        nickname:string
        remark:string
        sex:Sex
    }
}
