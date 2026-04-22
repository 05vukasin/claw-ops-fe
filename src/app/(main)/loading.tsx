export default function MainLoading() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-canvas-bg">
      <div className="flex flex-col items-center gap-4">
        <div
          aria-hidden
          className="h-10 w-10 rounded-md bg-[url('/logo/logo.png')] bg-contain bg-center bg-no-repeat opacity-70 animate-pulse"
        />
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-canvas-fg opacity-20 animate-pulse [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-canvas-fg opacity-20 animate-pulse [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-canvas-fg opacity-20 animate-pulse [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
