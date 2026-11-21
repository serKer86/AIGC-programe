import { AppFooter } from '../components/AppFooter'
import { SCHOOL_EMBLEM_SRC } from '../components/SchoolBrand'
import { ArrowLeftIcon, ShieldIcon } from '../components/icons'
import { isStaticHosting } from '../lib/env'
import { resetDisclaimer } from '../lib/consent'

interface ToolRow {
  name: string
  path: string
  what: string
  local: boolean
}

const TOOLS: ToolRow[] = [
  {
    name: '卡证通',
    path: '#/kazhengtong',
    what: '证件照抠图换底、按规格裁剪压缩，并给出合规校验结果。',
    local: false,
  },
  {
    name: '作业提醒',
    path: '#/homework',
    what: '登录学习通后汇总全部课程作业与截止时间，按紧急程度排序。',
    local: true,
  },
  {
    name: '图片压缩',
    path: '#/compress',
    what: '批量把图片压到指定 KB 以内，适配报名附件的体积限制。',
    local: false,
  },
  {
    name: '校园网址',
    path: '#/links',
    what: '教务、图书馆、选课等常用入口集中一屏，自定义链接只存本机。',
    local: false,
  },
  {
    name: 'GPA 计算',
    path: '#/gpa',
    what: '按杭电 5 分制换算绩点，支持百分制、五级制、二级制与补考规则。',
    local: true,
  },
]

const TECH = [
  ['前端', 'React 19 + TypeScript，Vite 8 构建'],
  ['样式', '原生 CSS，无 UI 框架，便于控制体积与观感'],
  ['抠图', 'MediaPipe Tasks Vision，模型与 wasm 随站点分发，全程本地推理'],
  ['后端', 'FastAPI + uvicorn，只监听 127.0.0.1:8000，不对局域网开放'],
  ['存储', '成绩与链接用 localStorage；学习通凭证用 Fernet 加密后存本机文件'],
  ['天气', 'Open-Meteo 免密钥接口，按固定坐标取杭州实时天气，本机缓存 15 分钟'],
  ['部署', 'GitHub Pages 静态托管 + GitHub Actions 自动构建'],
]

const CHANGELOG = [
  ['v1.7', '校园网址支持进入管理模式后拖动排序'],
  ['v1.6', '视觉细节统一：字号层级、圆角、空状态、禁用态与图标'],
  ['v1.5', '补充源码与反馈入口'],
  ['v1.4', '新增「关于本网站」与首次访问声明'],
  ['v1.3', '加入杭电校徽标识，公网版标注不可用工具'],
  ['v1.2', 'GPA 计算器改为站内页面，接入学习通课程；上线公网版本'],
  ['v1.1', '新增图片压缩、校园网址，首页改版为轮播 + 工具排序'],
  ['v1.0', '卡证通与作业提醒上线'],
]

export function AboutPage() {
  return (
    <div className="app app--about">
      <div className="tool-nav">
        <a className="back-link" href="#/">
          <ArrowLeftIcon />
          校园工具箱
        </a>
        <span className="privacy-pill">
          <ShieldIcon />
          个人作品 · 非官方系统
        </span>
      </div>

      <header className="app-header">
        <div className="brand">
          <span className="brand__mark brand__mark--school">
            <img src={SCHOOL_EMBLEM_SRC} alt="杭州电子科技大学校徽" width={34} height={34} />
          </span>
          <div>
            <h1 className="brand__title">关于本网站</h1>
            <p className="brand__subtitle">
              作品说明、隐私与免责声明
            </p>
            <p className="brand__en">HANGZHOU DIANZI UNIVERSITY</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="card about-card" aria-labelledby="about-intro">
          <h2 className="card__title" id="about-intro">
            这是什么
          </h2>
          <p className="card__desc">
            校园工具箱是一个<strong>本地优先</strong>的校园办事工具集合：能在这台设备上完成的，
            就绝不上传服务器。证件照处理、图片压缩全部在浏览器里跑；
            作业提醒与 GPA 的学习通同步需要一个只监听本机回环地址的小后端。
          </p>
          <p className="card__desc">
            {isStaticHosting()
              ? '你现在访问的是公网静态版本：纯前端功能完整可用，依赖本机后端的功能会显示「公网不可用」。'
              : '你现在访问的是本机版本：所有功能都可用。'}
          </p>
        </section>

        <section className="card about-card" aria-labelledby="about-tools">
          <h2 className="card__title" id="about-tools">
            包含哪些工具
          </h2>
          <ul className="about-tools">
            {TOOLS.map((tool) => (
              <li className="about-tools__item" key={tool.path}>
                <a className="about-tools__name" href={tool.path}>
                  {tool.name}
                </a>
                <span className="about-tools__what">{tool.what}</span>
                <span className={`tag ${tool.local ? 'tag--warn' : 'tag--ok'}`}>
                  {tool.local ? '需本机后端' : '纯前端'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card about-card" aria-labelledby="about-privacy">
          <h2 className="card__title" id="about-privacy">
            隐私说明
          </h2>
          <ul className="about-list">
            <li>照片与图片只在你的浏览器内存里处理，关闭页面即释放，不会上传。</li>
            <li>
              学习通手机号与密码经 Fernet 加密后写入本机
              <code>backend/data/cookies.enc</code>
              ，密钥存在同目录的 <code>secret.key</code>，两者都不会进入代码仓库。
            </li>
            <li>作业数据、成绩、自定义网址只保存在本机浏览器存储中，换设备不会同步。</li>
            <li>
              首页天气由 Open-Meteo（api.open-meteo.com）提供：请求只带杭州的固定坐标和日期，
              不含任何个人标识，也不需要定位权限；结果在本机缓存 15 分钟。
            </li>
            <li>除此之外没有埋点、没有统计脚本，不追踪浏览行为。</li>
          </ul>
        </section>

        <section className="card about-card" id="disclaimer" aria-labelledby="about-disclaimer">
          <h2 className="card__title" id="about-disclaimer">
            免责声明
          </h2>
          <div className="about-legal">
            <p>
              <strong>非官方声明。</strong>
              本站是学生个人开发的学习与竞赛作品，与杭州电子科技大学无任何官方隶属、授权或背书关系，
              并非学校官方校园服务系统，不承担正式校务服务职能。
            </p>
            <p>
              <strong>用途限定。</strong>
              所有功能仅用于技术展示、学习与竞赛演示；请勿将本站内容作为学校官方信息或办事依据。
            </p>
            <p>
              <strong>外部链接。</strong>
              站内跳转到第三方的链接仅出于方便访问，其内容、安全与服务质量由目标站点自行负责。
            </p>
            <p>
              <strong>可用性。</strong>
              本站为演示项目，不承诺 7×24 稳定运行，可能出现停机、报错、接口失效等情况；
              因网络故障、平台变更等造成的访问中断，开发者不承担相应责任。
            </p>
            <p>
              <strong>账号安全。</strong>
              本站不会把学习通账号密码发送到任何服务器；但请自行确认在可信设备上使用，
              公共电脑上不建议绑定账号。
            </p>
            <p>
              <strong>版权。</strong>
              杭电校徽与校名版权归杭州电子科技大学所有，本站仅在作品语境下引用；
              若权利人认为使用不当，请联系删除。
            </p>
            <p>
              <strong>使用规范。</strong>
              使用本站时应遵守国家网络相关法律法规及学校网络管理规定，不得用于违规用途。
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm about-legal__replay"
            onClick={() => {
              resetDisclaimer()
              window.location.hash = '#/'
              window.location.reload()
            }}
          >
            重新播放开屏声明
          </button>
        </section>

        <section className="card about-card" aria-labelledby="about-tech">
          <h2 className="card__title" id="about-tech">
            技术栈
          </h2>
          <dl className="about-dl">
            {TECH.map(([key, value]) => (
              <div className="about-dl__row" key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card about-card" aria-labelledby="about-links">
          <h2 className="card__title" id="about-links">
            源码与反馈
          </h2>
          <ul className="about-links">
            <li>
              <span className="about-links__key">源码仓库</span>
              <a
                className="about-links__val"
                href="https://github.com/serKer86/AIGC-programe"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/serKer86/AIGC-programe
              </a>
            </li>
            <li>
              <span className="about-links__key">问题反馈</span>
              <a
                className="about-links__val"
                href="https://github.com/serKer86/AIGC-programe/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                提交 Issue
              </a>
            </li>
            <li>
              <span className="about-links__key">当前版本</span>
              <span className="about-links__val">v1.7</span>
            </li>
            <li>
              <span className="about-links__key">公网站点</span>
              <a
                className="about-links__val"
                href="https://serker86.github.io/AIGC-programe/"
                target="_blank"
                rel="noopener noreferrer"
              >
                serker86.github.io/AIGC-programe
              </a>
            </li>
          </ul>
          <p className="card__desc">
            发现 bug、规格算错或想加新工具，都欢迎直接开 Issue；本机数据不会随反馈一起上传。
          </p>
        </section>

        <section className="card about-card" aria-labelledby="about-log">
          <h2 className="card__title" id="about-log">
            更新日志
          </h2>
          <ul className="about-log">
            {CHANGELOG.map(([version, text]) => (
              <li key={version}>
                <span className="about-log__ver">{version}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <AppFooter />
    </div>
  )
}
