# 强盛SRM前端原型

可运行的采购工作台和供应商门户。接口由浏览器里的MSW拦截，示例数据存在localStorage，没有真实后端。

示例数据用来点通流程，不是一期验收数据，通过标准见「38」。

## 启动

需要Node 22.12及以上。

```bash
cd 09-产品原型
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认`http://localhost:5173`）。入口是Hash路由：`#/`选身份，`#/buyer`进采购工作台，`#/portal`进供应商门户。

| 脚本 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查后打到`dist/`，可放到任意子路径下静态托管 |
| `npm run preview` | 预览构建结果 |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint |
| `npm run check:seed` | 回放示例数据，核对数量和状态对得上 |

构建产物用相对`base`，Hash路由不依赖服务端回退。开发服务器会读仓库根目录的`01-全局背景信息/11.待对齐事项.md`，悬停「待确认-n」看原文。

## 入口

打开后先选演示身份，没有真实登录。

- 采购工作台：企业侧角色进同一套菜单，按钮按角色显隐。采购员甲能走建单、审核、代录；财务对账开票；仓储确认预约；品质复核齐套和准入。
- 供应商门户：只看本公司的订单、发货、对账和税票。建议用「示例线材」或「示例充电头」，待办比较全。
- 门户未开通的供应商（如示例电子）不进门户，由采购代录；入口页有说明。

页头常驻「示例数据」。工作台「原型配置」可以改待确认开关、模拟ERP成败、重置示例数据。

## 页面

编号和设计说明第五节一致。采购工作台：

| 编号 | 页面 | 路由 |
| --- | --- | --- |
| C01 | 入口 | `/` |
| B01 | 我的待办 | `/buyer` |
| B02 | 采购订单 | `/buyer/orders` |
| B03 / B04 | 新建、编辑草稿 | `/buyer/orders/new`、`/buyer/orders/:id/edit` |
| B05 | 订单详情 | `/buyer/orders/:id` |
| B06 | 发起变更 | `/buyer/orders/:id/change` |
| B07 | 审核中心 | `/buyer/approvals` |
| B08 / B09 | 订单变更 | `/buyer/changes`、`/buyer/changes/:id` |
| B10 | 交期建议 | `/buyer/suggestions` |
| B11 | ERP推送监控 | `/buyer/erp-sync` |
| B12 / B13 / B14 | 发货单 | `/buyer/shipments`、`/buyer/shipments/:id`、`/buyer/shipments/new` |
| B15 | 预约看板 | `/buyer/appointments` |
| B16 | 收货结果 | `/buyer/receipts` |
| B17 | 交付预警 | `/buyer/alerts` |
| B18 | 箱码追溯 | `/buyer/trace` |
| B19 / B20 | 对账单 | `/buyer/reconciliations`、`/buyer/reconciliations/:id` |
| B21 / B22 | 开票申请 | `/buyer/invoice-requests`、`/buyer/invoice-requests/:id` |
| B23 | 税票登记 | `/buyer/invoices` |
| B24 | 红字确认 | `/buyer/red-letters` |
| B25 / B26 | 供应商档案 | `/buyer/suppliers`、`/buyer/suppliers/:code` |
| B27 / B28 | 供应商准入 | `/buyer/admissions`、`/buyer/admissions/new`、`/buyer/admissions/:id` |
| B29 | 绩效看板 | `/buyer/performance` |
| B30 | 操作日志 | `/buyer/audit-logs` |
| B31 | 原型配置 | `/buyer/prototype-settings` |

供应商门户（发货、收货、对账、红字确认和工作台共用页面，入口前缀换成`/portal`）：

| 编号 | 页面 | 路由 |
| --- | --- | --- |
| P01 | 首页 | `/portal` |
| P02 / P03 | 采购订单 | `/portal/orders`、`/portal/orders/:id` |
| P04 / P05 / P06 / P07 | 发货单、新建、详情、箱码打印 | `/portal/shipments`、`/portal/shipments/new`、`/portal/shipments/:id`、`/portal/shipments/:id/labels` |
| P08 | 预约送货 | `/portal/appointments` |
| P09 | 收货与退货 | `/portal/receipts` |
| P10 / P11 | 对账单 | `/portal/reconciliations`、`/portal/reconciliations/:id` |
| P12 | 开票 | `/portal/invoicing` |
| P13 | 红字确认 | `/portal/red-letters` |
| P14 | 账户 | `/portal/account` |

越权打开别人的单据就地显示「无权查看」，不跳转。

设计说明见[前端设计说明.md](前端设计说明.md)。修改规则见[AGENTS.md](AGENTS.md)。
