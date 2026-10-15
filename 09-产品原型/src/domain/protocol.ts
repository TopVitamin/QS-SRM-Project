/** 页面和模拟接口之间的约定：演示身份、原型配置都放在请求头里，接口按请求头判权限。 */
export const IDENTITY_HEADER = 'x-demo-identity'
export const CONFIG_HEADER = 'x-demo-config'

/** 示例数据和版本号存在localStorage。版本号变化时，其他标签页据此刷新。 */
export const DB_STORAGE_KEY = 'qs-srm-demo-db'
export const REV_STORAGE_KEY = 'qs-srm-demo-rev'
