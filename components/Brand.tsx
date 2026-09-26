import Image from 'next/image';

type BrandProps = {
  compact?: boolean;
  className?: string;
};

export function Brand({ compact = false, className = '' }: BrandProps) {
  return compact ? (
    <Image
      src="/logo-mark.svg"
      alt="LanguageRecap"
      width={32}
      height={32}
      className={className}
    />
  ) : (
    <Image
      src="/logo-horizontal-on-paper.svg"
      alt="LanguageRecap"
      width={183}
      height={29}
      priority
      className={className}
    />
  );
}
