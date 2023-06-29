logger.info(logger.yellow("- 正在加载 Telegram 插件"))

import { config, configSave } from "./Model/config.js"
import fetch from "node-fetch"
import path from "node:path"
import { fileTypeFromBuffer } from "file-type"
import sizeOf from "image-size"
import TelegramBot from "node-telegram-bot-api"
process.env.NTBA_FIX_350 = 1

const adapter = new class TelegramAdapter {
  constructor() {
    this.id = "Telegram"
    this.name = "TelegramBot"
  }

  async makeBuffer(file) {
    if (file.match(/^base64:\/\//))
      return Buffer.from(file.replace(/^base64:\/\//, ""), "base64")
    else if (file.match(/^https?:\/\//))
      return Buffer.from(await (await fetch(file)).arrayBuffer())
    else
      return file
  }

  async fileType(data) {
    const file = {}
    try {
      file.url = data.replace(/^base64:\/\/.*/, "base64://...")
      file.buffer = await this.makeBuffer(data)
      if (Buffer.isBuffer(file.buffer)) {
        file.type = await fileTypeFromBuffer(file.buffer)
        file.name = `${Date.now()}.${file.type.ext}`
      } else {
        file.name = path.basename(file.buffer)
      }
    } catch (err) {
      logger.error(`文件类型检测错误：${logger.red(err)}`)
    }
    return file
  }

  async sendMsg(data, msg) {
    if (!Array.isArray(msg))
      msg = [msg]
    const msgs = []
    const opts = {}
    for (let i of msg) {
      if (typeof i != "object")
        i = { type: "text", data: { text: i }}
      else if (!i.data)
        i = { type: i.type, data: { ...i, type: undefined }}

      let file
      if (i.data.file)
        file = await this.fileType(i.data.file)

      switch (i.type) {
        case "text":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送文本：[${data.id}] ${i.data.text}`)
          msgs.push(await data.bot.sendMessage(data.id, i.data.text, opts))
          break
        case "image":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送图片：[${data.id}] ${file.name}(${file.url})`)
          const size = sizeOf(file.buffer)
          if (size.height > 1280 || size.width > 1280)
            msgs.push(await data.bot.sendDocument(data.id, file.buffer, opts, { filename: file.name }))
          else
            msgs.push(await data.bot.sendPhoto(data.id, file.buffer, opts, { filename: file.name }))
          break
        case "record":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送音频：[${data.id}] ${file.name}(${file.url})`)
          msgs.push(await data.bot.sendAudio(data.id, file.buffer, opts, { filename: file.name }))
          break
        case "video":
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送视频：[${data.id}] ${file.name}(${file.url})`)
          msgs.push(await data.bot.sendVideo(data.id, file.buffer, opts, { filename: file.name }))
          break
        case "reply":
          opts.reply_to_message_id = i.data.id
          break
        case "at":
          break
        case "node":
          msgs.push(await this.sendForwardMsg(data, i.data))
          break
        default:
          i = JSON.stringify(i)
          logger.info(`${logger.blue(`[${data.self_id}]`)} 发送消息：[${data.id}] ${i}`)
          msgs.push(await data.bot.sendMessage(data.id, i, opts))
      }
    }
    return msgs
  }

  async sendForwardMsg(data, msg) {
    const messages = []
    for (const i of msg)
      messages.push(await this.sendMsg(data, i.message))
    return messages
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
    logger.info(`${logger.blue(`[${data.self_id}]`)} 发送文件：[${data.id}] ${filename}(${file})`)
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
      sendMsg: msg => this.sendMsg(i, msg),
      recallMsg: () => false,
      makeForwardMsg: Bot.makeForwardMsg,
      sendForwardMsg: msg => this.sendForwardMsg(i, msg),
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
      sendMsg: msg => this.sendMsg(i, msg),
      recallMsg: () => false,
      makeForwardMsg: Bot.makeForwardMsg,
      sendForwardMsg: msg => this.sendForwardMsg(i, msg),
      sendFile: (file, name) => this.sendFile(i, file, name),
      getInfo: () => i.bot.getChat(i.id),
      getAvatarUrl: () => this.getAvatarUrl(i),
      pickMember: user_id => this.pickMember(id, i.id, user_id),
    }
  }

  makeMessage(data) {
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
      logger.info(`${logger.blue(`[${data.self_id}]`)} 好友消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`)
      data.friend = data.bot.pickFriend(data.user_id)
    } else {
      data.group_id = `tg_${data.chat.id}`
      data.group_name = `${data.chat.title}-${data.chat.username}`
      data.bot.gl.set(data.group_id, {
        ...data.chat,
        group_id: data.group_id,
        group_name: data.group_name,
      })

      logger.info(`${logger.blue(`[${data.self_id}]`)} 群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`)
      data.friend = data.bot.pickFriend(data.user_id)
      data.group = data.bot.pickGroup(data.group_id)
      data.member = data.group.pickMember(data.user_id)
    }

    Bot.emit(`${data.post_type}.${data.message_type}`, data)
    Bot.emit(`${data.post_type}`, data)
  }

  async connect(token) {
    const bot = new TelegramBot(token, { polling: true, baseApiUrl: config.reverseProxy, request: { proxy: config.proxy }})
    bot.on("polling_error", logger.error)
    bot.info = await bot.getMe()

    if (!bot.info.id) {
      logger.error(`${logger.blue(`[${token}]`)} ${this.name}(${this.id}) 连接失败`)
      return false
    }

    const id = `tg_${bot.info.id}`
    Bot[id] = bot
    Bot[id].uin = id
    Bot[id].nickname = `${Bot[id].info.first_name}-${Bot[id].info.username}`
    Bot[id].version = {
      id: this.id,
      name: this.name,
      version: config.package.dependencies["node-telegram-bot-api"],
    }
    Bot[id].stat = { start_time: Date.now()/1000 }
    Bot[id].fl = new Map()
    Bot[id].gl = new Map()

    Bot[id].pickFriend = user_id => this.pickFriend(id, user_id)
    Bot[id].pickUser = Bot[id].pickFriend

    Bot[id].pickMember = (group_id, user_id) => this.pickMember(id, group_id, user_id)
    Bot[id].pickGroup = group_id => this.pickGroup(id, group_id)

    Bot[id].avatar = await Bot[id].pickFriend(id).getAvatarUrl()

    if (!Bot.uin.includes(id))
      Bot.uin.push(id)

    Bot[id].on("message", data => {
      data.self_id = id
      data.bot = Bot[id]
      this.makeMessage(data)
    })

    logger.mark(`${logger.blue(`[${id}]`)} ${this.name}(${this.id}) 已连接`)
    Bot.emit(`connect.${id}`, Bot[id])
    Bot.emit(`connect`, Bot[id])
    return true
  }

  async load() {
    for (const token of config.token)
      await adapter.connect(token)
    return true
  }
}

Bot.adapter.push(adapter)

export class Telegram extends plugin {
  constructor() {
    super({
      name: "Telegram",
      dsc: "Telegram",
      event: "message",
      rule: [
        {
          reg: "^#[Tt][Gg]账号$",
          fnc: "List",
          permission: "master"
        },
        {
          reg: "^#[Tt][Gg]设置[0-9]+:.+$",
          fnc: "Token",
          permission: "master"
        },
        {
          reg: "^#[Tt][Gg](代理|反代)",
          fnc: "Proxy",
          permission: "master"
        }
      ]
    })
  }

  async List () {
    await this.reply(`共${config.token.length}个账号：\n${config.token.join("\n")}`, true)
  }

  async Token () {
    const token = this.e.msg.replace(/^#[Tt][Gg]设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item != token)
      await this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
    } else {
      if (await adapter.connect(token)) {
        config.token.push(token)
        await this.reply(`账号已连接，共${config.token.length}个账号`, true)
      } else {
        await this.reply(`账号连接失败`, true)
        return false
      }
    }
    configSave(config)
  }

  async Proxy () {
    const proxy = this.e.msg.replace(/^#[Tt][Gg](代理|反代)/, "").trim()
    if (this.e.msg.match("代理")) {
      config.proxy = proxy
      await this.reply(`代理已${proxy?"设置":"删除"}，重启后生效`, true)
    } else {
      config.reverseProxy = proxy
      await this.reply(`反代已${proxy?"设置":"删除"}，重启后生效`, true)
    }
    configSave(config)
  }
}

logger.info(logger.green("- Telegram 插件 加载完成"))