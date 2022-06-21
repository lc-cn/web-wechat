import {Contactable} from "./contact";
import {User, UserInfo} from "./user";
import {Client} from "../client";
import {hide, lock} from "../common";
import {Sendable, TextElem} from "../message/elements";

export interface MemberInfo extends UserInfo {
    inviter: string
    is_admin: boolean
    friend: boolean
}

const weakMap = new WeakMap<MemberInfo, Member>()

/** @ts-ignore ts(2417) 群员(继承User) */
export class Member extends User {
    static as(this: Client, gid: string, id: string, strict?: boolean) {
        const info = this.gml.get(gid)?.get(id)
        if (strict && !info)
            throw new Error(`群${gid}中找不到群员` + id)
        let member = weakMap.get(info!)
        if (member) return member
        member = new Member(this, gid, id, info)
        if (info)
            weakMap.set(info, member)
        return member
    }

    constructor(c: Client, public readonly gid: string, id: string, _info?: MemberInfo) {
        super(c, id);
        lock(this, "gid")
        hide(this, "_info")
    }

}
