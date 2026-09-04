import Link from 'next/link';

const features = [
  ['01', '登记可信信息', '录入招标文件或合同的编号、主体、版本与关键日期。'],
  [
    '02',
    '生成唯一二维码',
    '系统生成不可枚举的随机核验地址，可嵌入电子或纸质文件。',
  ],
  ['03', '扫码公开核验', '公众无需登录，即可查看最新状态并逐项对照文件信息。'],
];

export default function HomePage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link href="/" className="brand brand-dark">
          <span className="brand-mark">海</span>
          <span>HaiTong QR</span>
        </Link>
        <Link href="/login" className="button button-ghost">
          进入管理端
        </Link>
      </nav>
      <section className="landing-hero">
        <div>
          <p className="eyebrow">文件真实性核验平台</p>
          <h1>
            让每一份重要文件，
            <br />
            <em>都有迹可循。</em>
          </h1>
          <p className="lead">
            为招标文件与合同建立可信电子档案。一个二维码连接登记信息、当前状态与完整版本轨迹。
          </p>
          <div className="hero-actions">
            <Link href="/login" className="button button-primary">
              开始登记 <span>→</span>
            </Link>
            <span className="trust-note">
              <b>✓</b> 无需安装应用即可扫码核验
            </span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="document-card">
            <div className="doc-head">
              <span>HT</span>
              <i />
            </div>
            <div className="doc-lines">
              <i />
              <i />
              <i />
            </div>
            <div className="fake-qr">
              {Array.from({ length: 49 }, (_, index) => (
                <span
                  key={index}
                  className={
                    [
                      0, 1, 2, 7, 8, 9, 14, 15, 16, 4, 5, 6, 11, 13, 18, 19, 20,
                      28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48,
                    ].includes(index)
                      ? 'dark'
                      : ''
                  }
                />
              ))}
            </div>
            <div className="verified-chip">✓ 已登记 · 信息一致</div>
          </div>
          <div className="orb orb-one" />
          <div className="orb orb-two" />
        </div>
      </section>
      <section className="feature-strip">
        {features.map(([number, title, description]) => (
          <article key={number}>
            <span>{number}</span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </section>
      <footer className="landing-footer">
        HaiTongQRcode · 二维码用于查询登记信息，不替代电子签章或司法鉴定。
      </footer>
    </main>
  );
}
