import { ethers } from 'ethers';

export function multiplyDecimal(left: string, right: string, rightScale: number): string {
  const leftUnits = ethers.parseUnits(left, 18);
  const rightUnits = ethers.parseUnits(right, rightScale);
  const result = leftUnits * rightUnits / (10n ** BigInt(rightScale));
  return ethers.formatUnits(result, 18);
}

export function divideDecimal(left: string, right: string): string {
  const leftUnits = ethers.parseUnits(left, 18);
  const rightUnits = ethers.parseUnits(right, 18);
  if (rightUnits === 0n) throw new Error('Cannot divide by zero');
  return ethers.formatUnits(leftUnits * (10n ** 18n) / rightUnits, 18);
}

export function maxDecimal(left: string, right: string): string {
  return ethers.parseUnits(left, 18) >= ethers.parseUnits(right, 18) ? left : right;
}
