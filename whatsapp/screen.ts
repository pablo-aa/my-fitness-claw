// Reading the bot session's terminal: what launch.ts answers, and what stops it.

// The screen as plain text: cursor moves become spaces, other escapes vanish.
export const plain = (s: string) => s
    .replace(/\x1b\[(\d*)C/g, (_, n) => ' '.repeat(Math.min(Number(n || 1), 200)))
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?<>=]*[ -\/]*[@-~]/g, '')
    .replace(/\x1b[()][A-Za-z0-9]|\x1b[=>78DEHMc]/g, '')
    .replace(/\r\n?/g, '\n')

// Without spaces or case: the terminal draws spaces as cursor moves, so words may arrive glued together.
export const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase()

// The development-channel warning for this plugin, with "I am using this for local development" selected.
export const warning = (plugin: string, flat: string) =>
    ['loadingdevelopmentchannels', `channels:plugin:${plugin.toLowerCase()}`, '❯1.iamusingthisforlocaldevelopment'].every((w) => flat.includes(w))

// The banner Claude Code shows once the channel is listening.
export const ready = (plugin: string, flat: string) => flat.includes(`messagesfromplugin:${plugin.toLowerCase()}injectdirectly`)

// Screens that need a person, worded as bot.sh words them for the Telegram bot; the first match wins.
const NEEDS: [string[], string][] = [
    [['notloggedin', 'pleaserun/login'], 'not logged in'],
    [['choosethetextstyle', 'selectloginmethod'], 'not set up: open Claude Code once in a terminal and sign in'],
    [['accessingworkspace:', 'doyoutrustthefilesinthisfolder', 'workspacenottrusted'], 'folder not trusted: open Claude Code in the fitness folder once and accept'],
    [['--channelsblockedbyorgpolicy', 'channelsarenotenabledforyourorg'], 'channels disabled by your organization: an admin must turn on channels'],
    [['channelsignored', 'channelsarenotcurrentlyavailable', 'channelsarenotavailable'], 'channels not available on this account'],
    [['automodeisunavailableforyourplan', 'automodeunavailableforthismodel'], 'auto mode unavailable: start it with MFC_PERMISSION_MODE=acceptEdits']
]

export function reason(flat: string): string | undefined {
    for (const [keys, why] of NEEDS) if (keys.some((k) => flat.includes(k))) return why
}

// A menu waiting for a key, other than the warning (whose menu is answered first).
export const menu = (flat: string) => flat.includes('entertoconfirm') || flat.includes('esctocancel')

// The dialog's title: the first line near the end that isn't a rule, a menu item or a hint.
export function dialog(screen: string): string {
    const lines = screen.split('\n').map((l) => l.trim()).filter((l) => l && !/^[─━▔▁-]+$/.test(l)).slice(-15)
    return lines.find((l) => !/^(❯|\d\.|enter to|esc to)/i.test(l.replace(/\s+/g, ' ')))?.slice(0, 120) ?? 'unknown dialog'
}
