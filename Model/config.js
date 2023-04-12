import fs from "fs"
import YAML from "yaml"
import _ from "lodash"

let path = `${process.cwd()}/plugins/Telegram-Plugin/`
let configFile = `${path}config.yaml`
let configData
let configSave = config => fs.writeFileSync(configFile, YAML.stringify(config), "utf-8")

let config = {
  tips: "",
  proxy: "",
  reverseProxy: "",
  token: []
}

if (fs.existsSync(configFile))
  try {
    configData = YAML.parse(fs.readFileSync(configFile, "utf-8"))
    _.merge(config, configData)
  } catch (err) {
    logger.error(`配置文件 读取失败：${logger.red(err)}`)
  }

config.tips = [
  "欢迎使用 Yunzai Telegram Plugin ! 作者：时雨🌌星空",
  "参考：https://github.com/TimeRainStarSky/Yunzai-Telegram-Plugin"
]

if (config != configData)
  configSave(config)

export { config, configSave }