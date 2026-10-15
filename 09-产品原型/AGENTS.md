# 产品原型 · 修改规则

本目录是可运行的前端原型，用来把`01-全局背景信息`已经写明的规则点通。字段、状态机仍以后续`04-产品设计方案`为准；原型里的状态名称是演示用的，不是定稿。

## 先读什么

- 改页面或交互：先读[前端设计说明](前端设计说明.md)对应章节，再看`src/buyer`、`src/portal`、`src/shared`。
- 改能不能点、数量、税票：先读`src/mocks/rules.ts`和对应的`orders.ts` / `shipments.ts` / `finance.ts`。页面只展示接口给出的`ActionState`，不要在组件里再写一套拦截。
- 引用【待确认-n】：编号必须已经出现在`01-全局背景信息/11.待对齐事项.md`。新缺口先补进那张表，再在正文或界面引用。悬停文案由`src/domain/pending.ts`从索引解析，不要手写另一套说明。

## 必须守住的规则

- 采购订单在SRM创建、审核，一张对一张推送ERP；ERP里的采购订单只读。改单只在SRM发起变更再推送。
- 供应商不能改数量和价格。有异议只能拒绝并写原因；交期有异议走交期建议。不提供带条件接受。
- 发货不超过可下推，不设超发、超收容差。发货单不是收货指令；收货只看ERP回传的通知单和入库单。
- 对账只取ERP已审核入库和采退出库，行不能改值。SRM不建应付、不付款。
- 税票按20位数电票号码登记，表单不设发票代码。纸票和旧版电子票见「44」。
- 门店只有直营和加盟。不编造强盛的家数、比例、账期、容差、人数、重试次数和接口行为。
- 示例数据由`src/mocks/seed.ts`按时间顺序调用业务函数生成，不要手写结果状态。验收数据和通过标准见「38」，示例数据不能当成验收数据。

## 技术约束

- React 19、TypeScript、Vite、Mantine 9、mantine-datatable 9、TanStack Table v9、React Router 7（`createHashRouter`）、TanStack Query、Zustand、MSW 3、Tabler Icons。
- 不用Tailwind、shadcn、Radix、Ant Design、daisyUI、`@mantine/modals`。
- 工作台按桌面信息密度；门户按手机可点（列表变卡片，主要动作底部固定，可点区域不小于44px）。
- 非组件导出放在`.ts`。改完跑`npm run typecheck`、`npm run lint`、`npm run check:seed`。
