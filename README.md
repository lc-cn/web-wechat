## lib-wechat

1. nodejs 微信实现，目前依赖于 [http://49.234.86.244:8080/](http://49.234.86.244:8080/)提供的服务
2. 按照oicq的规范，实现了微信的部分接口
3. 目前处于测试阶段，功能较少，Bug较多

## 使用样例

1. 安装依赖：

```shell
npm install lib-wechat --save
```

2. 引入：

```javascript
const {Client} = require('lib-wechat');
const client = new Client('wxid_xxxxx');
client.login()
client.on('message', (e) => {
    console.log(e);
    if (e.content === 'hello') {
        e.reply('world');
    }
})
```

## 感谢

1. [oicq](https://github.com/takayama-lily/oicq) 提供参考代码
2. [http://49.234.86.244:8080/](http://49.234.86.244:8080/) 提供API服务支持

## 申明

1. 本仓库使用Mit协议开源，使用本仓库代码，请遵守MIT协议
2. 本仓库代码仅供学习交流，不得用于商业用途
3. 开源项目，造成的任何后果，本人不负任何责任
