# 音频素材来源与许可

游戏里的风、雨、雷、引擎用的是真实录音；其余音效（火、汽笛、提示音等）仍是程序合成。
`src/` 里是下载到的原始文件，每个旁边有一份 `.license.json`（来源 URL、许可、sha256、抓取时间）。
外层的 mp3 是从原始文件裁剪、归一化得到的。

| 游戏用文件 | 原始素材 | 来源 | 许可 |
|---|---|---|---|
| rain_light.mp3 | Light rain loop | https://assets.mixkit.co/active_storage/sfx/2393/2393-preview.mp3 | Mixkit Sound Effects Free License |
| rain_heavy.mp3 | Heavy rain drops | https://assets.mixkit.co/active_storage/sfx/2399/2399-preview.mp3 | Mixkit Sound Effects Free License |
| wind_base.mp3 | Wind blowing ambience（2–34 s） | https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3 | Mixkit Sound Effects Free License |
| wind_howl.mp3 | Howling wind（40–72 s） | https://upload.wikimedia.org/wikipedia/commons/2/2d/Howling_wind.ogg | CC0 |
| thunder_1.mp3、thunder_3.mp3 | Thunder rumble during a storm（0.25–10.5 s、31.6–36.6 s） | https://assets.mixkit.co/active_storage/sfx/2395/2395-preview.mp3 | Mixkit Sound Effects Free License |
| thunder_2.mp3 | Distant thunder explosion（0–7 s） | https://assets.mixkit.co/active_storage/sfx/1278/1278-preview.mp3 | Mixkit Sound Effects Free License |
| engine_a.mp3（星型发动机机型：维加、福克、S-38） | Propeller engine loop | https://assets.mixkit.co/active_storage/sfx/1571/1571-preview.mp3 | Mixkit Sound Effects Free License |
| engine_b.mp3（V12 发动机机型：宝玑、鲸式） | Plane engine hum in the track | https://assets.mixkit.co/active_storage/sfx/1572/1572-preview.mp3 | Mixkit Sound Effects Free License |

Mixkit 的条款见 https://mixkit.co/license/ （免署名；发布前请自行核对条款原文）。
