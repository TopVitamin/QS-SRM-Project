/** 页面和模拟接口之间的约定：演示身份、原型配置都放在请求头里，接口按请求头判权限。 */
export const IDENTITY_HEADER = 'x-demo-identity'
export const CONFIG_HEADER = 'x-demo-config'
