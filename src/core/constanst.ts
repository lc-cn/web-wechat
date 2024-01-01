export enum SyncRet{
    Success=0,
    Logout=1101
}
export enum Status{
    Init='init',
    Login='login',
    Logout='logout'
}
export enum Sex{
    Male,
    Female
}
export enum SyncSelector{
    Normal=0,
    Msg=2,
    MobileOpen=7
}
export const CHUNK_SIZE = 0.5 * 1024 * 1024 // 0.5 MB
export enum OriginMessage{
    Text=1,
    Image=3,
    Voice=34,
    Video=43,
    MicroVideo=62,
    Emotion=47,
    App=49,
    StatusNotice=51,
    SysNotice=9999,
    PossibleFriendMsg=40,
    VerifyMsg=37,
    ShareCard=42,
    Sys=1e4,
    Recalled=10002
}
export class AlreadyLoggedError extends Error{
    constructor() {
        super('AlreadyLogged');
    }
    message='已退出登录'
}
export const alreadyLogoutError=new AlreadyLoggedError()
