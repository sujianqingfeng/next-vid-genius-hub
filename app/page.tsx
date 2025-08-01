import Image from "next/image";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <h1 className="text-4xl font-bold text-center sm:text-left">
          Welcome to Next.js
        </h1>
        <p className="text-lg text-center sm:text-left max-w-[600px]">
          Your Next.js application is ready to go!
        </p>
      </main>
    </div>
  );
}
