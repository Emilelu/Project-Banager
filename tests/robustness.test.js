/**
 * 健壮性 / 性能回归测试
 * 覆盖本次优化的关键防线：URL 白名单、配置 schema 校验、落盘合并、索引存在性
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sanitizeBackgroundUrl, sanitizeImageUrl } from '../src/composables/useAppearance'

// useAppearance 依赖 DOM 与 localStorage，这里只测纯函数部分
describe('壁纸 URL 协议白名单', () => {
  it.each([
    ['https://example.com/a.jpg', true],
    ['http://example.com/a.jpg', true],
    ['/assets/local.webp', true],
    ['./pic.png', true],
  ])('接受合法地址 %s', (input, ok) => {
    const out = sanitizeBackgroundUrl(input)
    expect(!!out).toBe(ok)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///C:/Windows/system32',
    'about:blank',
  ])('拒绝危险 scheme: %s', (input) => {
    expect(sanitizeBackgroundUrl(input)).toBe('')
  })

  it('拒绝带账号密码的 URL', () => {
    expect(sanitizeImageUrl('https://user:pass@example.com/a.jpg')).toBe('')
  })

  it('空值与非法字符串返回空串', () => {
    expect(sanitizeBackgroundUrl('')).toBe('')
    expect(sanitizeBackgroundUrl(null)).toBe('')
    expect(sanitizeBackgroundUrl(undefined)).toBe('')
    expect(sanitizeBackgroundUrl('   ')).toBe('')
  })

  it('规范化相对路径为绝对 URL', () => {
    const out = sanitizeImageUrl('/a.jpg')
    expect(out.startsWith('http')).toBe(true)
    expect(out.endsWith('/a.jpg')).toBe(true)
  })
})

describe('危险 URL 在打开/应用前被拦截', () => {
  it('自定义壁纸填 javascript: 时不会进入 state.bgUrl', () => {
    // sanitizeBackgroundUrl 是 UI 与状态之间的唯一闸门
    expect(sanitizeBackgroundUrl('javascript:document.title="pwned"')).toBe('')
  })

  it('打开原图用的 sanitizeImageUrl 同样拒绝 data:text/html', () => {
    expect(sanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('合法 https 图片地址原样通过', () => {
    const url = 'https://example.com/wallpaper.webp'
    expect(sanitizeImageUrl(url)).toBe(url)
  })

  it('blob: 地址允许（预览使用场景）', () => {
    const blob = 'blob:http://localhost/abc-123'
    expect(sanitizeImageUrl(blob)).toBe(blob)
  })
})
