export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center fade-in-up">
        <div className="text-6xl mb-6" role="img" aria-label="メンテナンス中">
          🔧
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          メンテナンスちゅう
        </h1>
        <p className="text-gray-500 mb-6">
          いま システムを よくしています
          <span className="inline-flex w-8 text-left">
            <span className="dot-animation" />
          </span>
        </p>
        <p className="text-sm text-gray-400">
          すこし まってから もういちど アクセスしてね
        </p>

        <style>{`
          .dot-animation::after {
            content: '';
            animation: dots 1.5s steps(4, end) infinite;
          }
          @keyframes dots {
            0%  { content: ''; }
            25% { content: '.'; }
            50% { content: '..'; }
            75% { content: '...'; }
          }
        `}</style>
      </div>
    </div>
  );
}
