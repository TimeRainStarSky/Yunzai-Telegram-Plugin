logger.info(logger.yellow("- 正在加载 Telegram 适配器插件"))

import makeConfig from "../../lib/plugins/config.js"
import fetch from "node-fetch"
import path from "node:path"
import imageSize from "image-size"
import TelegramBot from "node-telegram-bot-api"
process.env.NTBA_FIX_350 = 1

const { config, configSave } = await makeConfig("Telegram", {
  tips: "",
  permission: "master",
  proxy: "",
  reverseProxy: "",
  token: [],
}, {
  tips: [
    "欢迎使用 TRSS-Yunzai Telegram Plugin ! 作者：时雨🌌星空",
    "参考：https://github.com/TimeRainStarSky/Yunzai-Telegram-Plugin",
  ],
})

const adapter = new class TelegramAdapter {
  constructor() {
    this.id = "Telegram"
    this.name = "TelegramBot"
    this.version = `node-telegram-bot-api v0.64.0`
  }

  async sendMsg(data, msg, opts = {}) {
    if (!Array.isArray(msg))
      msg = [msg]
    const msgs = []
    const message_id = []
    for (let i of msg) {
      if (typeof i != "object")
        i = { type: "text", text: i }

      let file
      if (i.file)
        file = await Bot.fileType(i.file, i.name)

      let ret
      switch (i.type) {
        case "text":
          Bot.makeLog("info", `发送文本：[${data.id}] ${i.text}`, data.self_id)
          ret = await data.bot.sendMessage(data.id, i.text, opts)
          break
        case "image":
          Bot.makeLog("info", `发送图片：[${data.id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          const size = imageSize(file.buffer)
          if (size.height > 1280 || size.width > 1280)
            ret = await data.bot.sendDocument(data.id, file.buffer, opts, { filename: file.name })
          else
            ret = await data.bot.sendPhoto(data.id, file.buffer, opts, { filename: file.name })
          break
        case "record":
          Bot.makeLog("info", `发送音频：[${data.id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          if (file.type.ext == "mp3" || file.type.ext == "m4a")
            ret = await data.bot.sendAudio(data.id, file.buffer, opts, { filename: file.name })
          else if (file.type.ext == "opus")
            ret = await data.bot.sendVoice(data.id, file.buffer, opts, { filename: file.name })
          else
            ret = await data.bot.sendDocument(data.id, file.buffer, opts, { filename: file.name })
          break
        case "video":
          Bot.makeLog("info", `发送视频：[${data.id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          ret = await data.bot.sendVideo(data.id, file.buffer, opts, { filename: file.name })
          break
        case "reply":
          opts.reply_to_message_id = i.id
          break
        case "at": {
          const at = (await data.bot.pickFriend(i.qq).getInfo()).username
          Bot.makeLog("info", `发送提及：[${data.id}] @${at}(${i.qq})`, data.self_id)
          ret = await data.bot.sendMessage(data.id, `@${at}`, opts)
          break
        } case "node":
          ret = await Bot.sendForwardMsg(msg => this.sendMsg(data, msg), i.data)
          break
        case "button":
          continue
        default:
          i = JSON.stringify(i)
          Bot.makeLog("info", `发送消息：[${data.id}] ${i}`, data.self_id)
          ret = await data.bot.sendMessage(data.id, i, opts)
      }
      if (ret) {
        msgs.push(ret)
        if (ret.message_id)
          message_id.push(ret.message_id)
      }
    }
    return { data: msgs, message_id }
  }

  async recallMsg(data, message_id, opts) {
    Bot.makeLog("info", `撤回消息：[${data.id}] ${message_id}`, data.self_id)
    if (!Array.isArray(message_id))
      message_id = [message_id]
    const msgs = []
    for (const i of message_id)
      msgs.push(await data.bot.deleteMessage(data.id, i, opts))
    return msgs
  }

  async getAvatarUrl(data) {
    try {
      return data.bot.getFileLink((await data.bot.getChat(data.id)).photo.big_file_id)
    } catch (err) {
      logger.error(`获取头像错误：${logger.red(err)}`)
      return false
    }
  }

  async sendFile(data, file, filename = path.basename(file)) {
    Bot.makeLog("info", `发送文件：[${data.id}] ${filename}(${file})`, data.self_id)
    return data.bot.sendDocument(data.id, await this.makeBuffer(file), undefined, { filename })
  }

  pickFriend(id, user_id) {
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      id: user_id.replace(/^tg_/, ""),
    }
    return {
      ...i,
      sendMsg: (msg, opts) => this.sendMsg(i, msg, opts),
      recallMsg: (message_id, opts) => this.recallMsg(i, message_id, opts),
      sendFile: (file, name) => this.sendFile(i, file, name),
      getInfo: () => i.bot.getChat(i.id),
      getAvatarUrl: () => this.getAvatarUrl(i),
    }
  }

  pickMember(id, group_id, user_id) {
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      group_id: group_id.replace(/^tg_/, ""),
      user_id: user_id.replace(/^tg_/, ""),
    }
    return {
      ...this.pickFriend(id, user_id),
      ...i,
      getInfo: () => i.bot.getChatMember(i.group_id, i.user_id),
    }
  }

  pickGroup(id, group_id) {
    const i = {
      ...Bot[id].gl.get(group_id),
      self_id: id,
      bot: Bot[id],
      id: group_id.replace(/^tg_/, ""),
    }
    return {
      ...i,
      sendMsg: (msg, opts) => this.sendMsg(i, msg, opts),
      recallMsg: (message_id, opts) => this.recallMsg(i, message_id, opts),
      sendFile: (file, name) => this.sendFile(i, file, name),
      getInfo: () => i.bot.getChat(i.id),
      getAvatarUrl: () => this.getAvatarUrl(i),
      pickMember: user_id => this.pickMember(id, i.id, user_id),
    }
  }

  makeMessage(data) {
    data.bot = Bot[data.self_id]
    data.post_type = "message"
    data.user_id = `tg_${data.from.id}`
    data.sender = {
      user_id: data.user_id,
      nickname: `${data.from.first_name}-${data.from.username}`,
    }
    data.bot.fl.set(data.user_id, { ...data.from, ...data.sender })

    switch (data.chat.type) {
      case "supergroup":
        data.message_type = "group"
        break
      default:
        data.message_type = data.chat.type
    }

    data.message = []
    data.raw_message = ""
    if (data.text) {
      data.message.push({ type: "text", text: data.text })
      data.raw_message += data.text
    }

    if (data.from.id == data.chat.id) {
      Bot.makeLog("info", `好友消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, data.self_id)
    } else {
      data.group_id = `tg_${data.chat.id}`
      data.group_name = `${data.chat.title}-${data.chat.username}`
      data.bot.gl.set(data.group_id, {
        ...data.chat,
        group_id: data.group_id,
        group_name: data.group_name,
      })
      Bot.makeLog("info", `群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, data.self_id)
    }

    Bot.emit(`${data.post_type}.${data.message_type}`, data)
    Bot.emit(`${data.post_type}`, data)
  }

  async connect(token) {
    const bot = new TelegramBot(token, { polling: true, baseApiUrl: config.reverseProxy, request: { proxy: config.proxy }})
    bot.on("polling_error", logger.error)
    bot.login = bot.startPolling
    bot.logout = bot.stopPolling
    try {
      bot.info = await bot.getMe()
    } catch (err) {
      logger.error(`${logger.blue(`[${token}]`)} 获取 Bot 信息错误：${logger.red(err)}`)
    }

    if (!bot.info?.id) {
      logger.error(`${logger.blue(`[${token}]`)} ${this.name}(${this.id}) ${this.version} 连接失败`)
      return false
    }

    const id = `tg_${bot.info.id}`
    Bot[id] = bot
    Bot[id].adapter = this
    Bot[id].uin = id
    Bot[id].nickname = `${Bot[id].info.first_name}-${Bot[id].info.username}`
    Bot[id].version = {
      id: this.id,
      name: this.name,
      version: this.version,
    }
    Bot[id].stat = { start_time: Date.now()/1000 }
    Bot[id].fl = new Map
    Bot[id].gl = new Map
    Bot[id].gml = new Map

    Bot[id].pickFriend = user_id => this.pickFriend(id, user_id)
    Bot[id].pickUser = Bot[id].pickFriend

    Bot[id].pickMember = (group_id, user_id) => this.pickMember(id, group_id, user_id)
    Bot[id].pickGroup = group_id => this.pickGroup(id, group_id)

    Bot[id].avatar = await Bot[id].pickFriend(id).getAvatarUrl()

    Bot[id].on("message", data => {
      data.self_id = id
      this.makeMessage(data)
    })

    logger.mark(`${logger.blue(`[${id}]`)} ${this.name}(${this.id}) ${this.version} 已连接`)
    Bot.em(`connect.${id}`, { self_id: id })
    return true
  }

  async load() {
    for (const token of config.token)
      await new Promise(resolve => {
        adapter.connect(token).then(resolve)
        setTimeout(resolve, 5000)
      })
  }
}

Bot.adapter.push(adapter)

export class Telegram extends plugin {
  constructor() {
    super({
      name: "TelegramAdapter",
      dsc: "Telegram 适配器设置",
      event: "message",
      rule: [
        {
          reg: "^#[Tt][Gg]账号$",
          fnc: "List",
          permission: config.permission,
        },
        {
          reg: "^#[Tt][Gg]设置[0-9]+:.+$",
          fnc: "Token",
          permission: config.permission,
        },
        {
          reg: "^#[Tt][Gg](代理|反代)",
          fnc: "Proxy",
          permission: config.permission,
        }
      ]
    })
  }

  List() {
    this.reply(`共${config.token.length}个账号：\n${config.token.join("\n")}`, true)
  }

  async Token() {
    const token = this.e.msg.replace(/^#[Tt][Gg]设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item != token)
      this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
    } else {
      if (await adapter.connect(token)) {
        config.token.push(token)
        this.reply(`账号已连接，共${config.token.length}个账号`, true)
      } else {
        this.reply(`账号连接失败`, true)
        return false
      }
    }
    await configSave()
  }

  async Proxy() {
    const proxy = this.e.msg.replace(/^#[Tt][Gg](代理|反代)/, "").trim()
    if (this.e.msg.match("代理")) {
      config.proxy = proxy
      this.reply(`代理已${proxy?"设置":"删除"}，重启后生效`, true)
    } else {
      config.reverseProxy = proxy
      this.reply(`反代已${proxy?"设置":"删除"}，重启后生效`, true)
    }
    await configSave()
  }
}

logger.info(logger.green("- Telegram 适配器插件 加载完成"))