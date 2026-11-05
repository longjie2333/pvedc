import { Outlet } from 'react-router-dom';
import { Check, Server } from 'lucide-react';

const features = ['独立的 Linux 环境', '资源状态一目了然', '公网服务轻松访问'];
// Concentric rings carried over from the original auth-story background.
const rings = 'shadow-[0_0_0_55px_#ffffff03,0_0_0_110px_#ffffff02]';

export function AuthLayout({ title }: { title: string }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[48%_52%]">
      <aside className="relative flex flex-col gap-8 overflow-hidden bg-[#123d2c] px-[10%] py-8 text-[#f2f6ef] lg:gap-0 lg:px-[11%] lg:py-12">
        <div
          aria-hidden="true"
          className={
            'pointer-events-none absolute -right-[220px] -bottom-[50px] size-[450px] rounded-full border border-[#ffffff0b] ' +
            rings
          }
        />
        <div className="relative flex items-center gap-2.5 whitespace-nowrap font-semibold text-sm lg:gap-3 lg:font-[650] lg:text-[17px]">
          <span className="grid size-7 place-items-center rounded-lg border border-[#ffffff2a] bg-[#ffffff0d] lg:size-[37px] lg:rounded-[10px]">
            <Server className="size-4 lg:size-[23px]" />
          </span>
          {title}
        </div>
        <div className="relative flex flex-col gap-4 lg:my-auto lg:block lg:py-[75px]">
          <h1 className="font-medium text-3xl leading-tight tracking-tight lg:text-[clamp(38px,4vw,63px)] lg:leading-[1.4] lg:tracking-[-2px]">
            你的项目，
            <br />
            有了自己的
            <br />
            <span className="text-[#c3d6a7]">计算空间。</span>
          </h1>
          <p className="text-[#a2baa8] text-sm leading-7 lg:mt-[27px] lg:leading-loose">
            认领你的专属 Linux 环境。
            <br />
            从毕业设计的第一行代码，到最后一次演示。
          </p>
          <ul className="flex flex-col gap-3 text-[#c4d5c7] text-xs/[1.6] max-lg:hidden lg:mt-[35px]">
            {features.map(feature => (
              <li key={feature} className="flex min-h-6 items-center gap-3">
                <Check aria-hidden="true" className="size-[15px] text-[#b6ce9c]" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="grid place-items-center bg-sidebar px-4 py-8 lg:py-12">
        <div className="flex w-full max-w-sm flex-col gap-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="pb-2.5">
      <h2 className="font-[620] text-[25px] tracking-[-1px] sm:text-[27px]">{title}</h2>
      <p className="mt-3 text-[13px] text-muted-foreground">{intro}</p>
    </div>
  );
}
