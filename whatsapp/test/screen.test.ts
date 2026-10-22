import { describe, expect, test } from 'bun:test'
import { dialog, menu, plain, ready, reason, squash, warning } from '../screen'

const plugin = 'whatsapp@my-fitness-claw'
// The screens as Claude Code 2.1 draws them, with cursor moves for spaces.
const sp = (s: string) => s.replace(/ /g, '\x1b[1C')
const WARNING = sp([
    '\x1b[2J\x1b[H────────────────',
    'WARNING: Loading development channels',
    '--dangerously-load-development-channels is for local channel development only. Do not use this option to run',
    'channels you have downloaded off the internet.',
    'Please use --channels to run a list of approved channels.',
    `Channels: plugin:${plugin}`,
    '\x1b[36m❯ 1. I am using this for local development\x1b[39m',
    '  2. Exit',
    'Enter to confirm · Esc to cancel'
].join('\r\n'))

describe('screen', () => {
    test('plain text from the terminal', () => {
        expect(plain('a\x1b[3Cb\x1b[0m\r\nc\x1b]0;title\x07')).toBe('a   b\nc')
        expect(squash(' A b\nC ')).toBe('abc')
    })
    test('the warning for this plugin, with the first option selected', () => {
        const flat = squash(plain(WARNING))
        expect(warning(plugin, flat)).toBe(true)
        expect(menu(flat)).toBe(true)
        expect(warning('whatsapp@other', flat)).toBe(false)
        expect(warning(plugin, flat.replace('❯1.iam', '1.iam'))).toBe(false)
        expect(reason(flat)).toBeUndefined()
    })
    test('the channel banner', () => {
        const banner = sp(`▎Channels (experimental) messages from plugin:${plugin} inject directly in this session · restart without`)
        expect(ready(plugin, squash(plain(banner)))).toBe(true)
        expect(ready('whatsapp@other', squash(plain(banner)))).toBe(false)
    })
    test('screens that need a person', () => {
        const cases: [string, string][] = [
            ['Accessing workspace:\n/home/sam/my-fitness\nQuick safety check: Is this a project you created or one you trust?\n❯ 1. Yes, I trust this folder\nEnter to confirm · Esc to cancel', 'folder not trusted'],
            ['Not logged in · Please run /login', 'not logged in'],
            ["Let's get started.\nChoose the text style that looks best with your terminal", 'not set up'],
            ['--dangerously-load-development-channels ignored (plugin:x)\nChannels are not currently available', 'channels not available'],
            ['--channels blocked by org policy', 'channels disabled'],
            ['Auto mode is unavailable for your plan', 'auto mode unavailable']
        ]
        for (const [screen, why] of cases) expect(reason(squash(plain(sp(screen))))).toStartWith(why)
    })
    test('a dialog is named by its title, not its options', () => {
        expect(dialog('───\nDo you want to proceed?\n❯ 1. Yes\n  2. No\nEnter to confirm · Esc to cancel')).toBe('Do you want to proceed?')
        expect(dialog('')).toBe('unknown dialog')
    })
})
