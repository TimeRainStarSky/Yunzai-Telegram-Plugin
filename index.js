logger.info(logger.yellow("- 正在加载 Telegram 插件"))

import { config, configSave } from "./Model/config.js"
import TelegramBot from "node-telegram-bot-api"
process.env.NTBA_FIX_350 = 1

function makeBuffer(base64) {
  return Buffer.from(base64.replace(/^base64:\/\//, ""), "base64")
}

function makeMsg(data, msg) {
  if (typeof msg == "string")
    return data.bot.sendMessage(data.id, msg)
  switch (msg.type) {
    case "text":
      logger.info(`${logger.blue(`[${data.self_id}]`)} 发送文本：[${data.id}] ${msg.data.text}`)
      return data.bot.sendMessage(data.id, msg.data.text)
    case "image":
      logger.info(`${logger.blue(`[${data.self_id}]`)} 发送图片：[${data.id}]`)
      return data.bot.sendPhoto(data.id, makeBuffer(msg.data.file))
    case "record":
      logger.info(`${logger.blue(`[${data.self_id}]`)} 发送音频：[${data.id}]`)
      return data.bot.sendAudio(data.id, makeBuffer(msg.data.file))
    default:
      logger.info(`${logger.blue(`[${data.self_id}]`)} 发送消息：[${data.id}] ${JSON.stringify(msg)}`)
      return data.bot.sendMessage(data.id, JSON.stringify(msg))
  }
}

async function sendMsg(data, msg) {
  if (Array.isArray(msg)) {
    let msgs = []
    for (const i of msg)
      msgs.push(await makeMsg(data, i))
    return msgs
  } else {
    return makeMsg(data, msg)
  }
}

async function makeForwardMsg(data, msg) {
  let messages = []
  for (const i of msg)
    messages.push(await sendMsg(data, i.message))
  messages.data = "消息"
  return messages
}

function makeMessage(data) {
  data.user_id = `tg_${data.from.id}`
  data.sender = {
    nickname: data.from.username
  }
  data.post_type = "message"
  data.message_type = data.chat.type

  let message = []
  if (data.text)
    message.push({ type: "text", text: data.text })
  data.message = message

  if (data.from.id == data.chat.id) {
    logger.info(`${logger.blue(`[${data.self_id}]`)} 好友消息：[${data.sender.nickname}(${data.user_id})] ${JSON.stringify(data.message)}`)
    data.friend = data.bot.pickFriend(data.user_id)
  } else {
    data.group_id = `tg_${data.chat.id}`
    data.group_name = data.chat.username
    logger.info(`${logger.blue(`[${data.self_id}]`)} 群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${JSON.stringify(data.message)}`)
    data.friend = data.bot.pickFriend(data.user_id)
    data.group = data.bot.pickGroup(data.group_id)
    data.member = data.group.pickMember(data.user_id)
  }

  Bot.emit(`${data.post_type}.${data.message_type}`, data)
  Bot.emit(`${data.post_type}`, data)
}

for (const token of config.token) {
  let id = `tg_${token.split(":")[0]}`
  Bot[id] = new TelegramBot(token, { polling: true, baseApiUrl: config.reverseProxy, request: { proxy: config.proxy }})
  Bot[id].on("polling_error", logger.error)

  Bot[id].pickFriend = user_id => {
    let i = { self_id: id, bot: Bot[id], id: user_id.replace(/^tg_/, "") }
    return {
      sendMsg: msg => sendMsg(i, msg),
      recallMsg: () => false,
      makeForwardMsg: msg => makeForwardMsg(i, msg),
    }
  }
  Bot[id].pickUser = Bot[id].pickFriend
  Bot[id].pickMember = (group_id, user_id) => Bot[id].pickFriend(user_id)

  Bot[id].pickGroup = group_id => {
    let i = { self_id: id, bot: Bot[id], id: group_id.replace(/^tg_/, "") }
    return {
      sendMsg: msg => sendMsg(i, msg),
      recallMsg: () => false,
      makeForwardMsg: msg => makeForwardMsg(i, msg),
      pickMember: user_id => Bot[id].pickMember(i.id, user_id),
    }
  }

  Bot[id].uin = id

  if (Array.isArray(Bot.uin)) {
    if (!Bot.uin.includes(id))
      Bot.uin.push(id)
  } else {
    Bot.uin = [id]
  }
  Bot[id].on("message", data => {
    data.self_id = id
    data.bot = Bot[id]
    makeMessage(data)
  })
  logger.mark(`${logger.blue(`[${id}]`)} 已连接`)
}

export class Telegram extends plugin {
  constructor () {
    super({
      name: "Telegram",
      dsc: "Telegram",
      event: "message",
      permission: "master",
      rule: [
        {
          reg: "^#[Tt][Gg]账号$",
          fnc: "List"
        },
        {
          reg: "^#[Tt][Gg]设置[0-9]+:[A-Za-z0-9]+$",
          fnc: "Token"
        },
        {
          reg: "^#[Tt][Gg](代理|反代)",
          fnc: "Proxy"
        }
      ]
    })
  }

  async List () {
    await this.reply(`共${config.token.length}个账号：\n${config.token.join("\n")}`, true)
  }

  async Token () {
    let token = this.e.msg.replace(/^#[Tt][Gg]设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item != token)
      await this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
    } else {
      config.token.push(token)
      await this.reply(`账号已添加，重启后生效，共${config.token.length}个账号`, true)
    }
    configSave(config)
  }

  async Proxy () {
    let proxy = this.e.msg.replace(/^#[Tt][Gg](代理|反代)/, "").trim()
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