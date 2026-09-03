import { APP_NAME } from '@haitong/shared';

const milestones = [
  '登记招标文件或合同信息',
  '生成唯一公开核验二维码',
  '扫码查看最新状态和公开信息',
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">项目骨架已运行</p>
        <h1 id="page-title">{APP_NAME}</h1>
        <p className="summary">招标文件与合同二维码登记、核验和追溯系统</p>
        <ol className="milestones">
          {milestones.map((milestone) => (
            <li key={milestone}>{milestone}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
