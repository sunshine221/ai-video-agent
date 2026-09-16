'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { User, KeyRound, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ChangePasswordDialog } from './change-password-dialog';

/** 取名字/邮箱首字母做头像 fallback */
function initials(nameOrEmail: string): string {
  const s = nameOrEmail.trim();
  if (!s) return '?';
  return s[0].toUpperCase();
}

export function UserMenu() {
  const { data: session } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  if (!session?.user) return null;

  const name = session.user.name || '';
  const email = session.user.email || '';
  const displayName = name || email;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title="账户菜单"
          >
            <Avatar>
              <AvatarFallback>{initials(displayName)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">{displayName}</span>
            {name && email && (
              <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <User className="h-4 w-4 text-muted-foreground" />
            个人信息
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPwdOpen(true)}>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            修改密码
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => signOut({ callbackUrl: '/login' })}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 个人信息 */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>个人信息</DialogTitle>
            <DialogDescription>当前登录账号的基础信息</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 pt-2">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="text-lg">{initials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-base font-medium">{name || '未设置昵称'}</div>
              <div className="truncate text-sm text-muted-foreground">{email}</div>
            </div>
          </div>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between border-t pt-2">
              <dt className="text-muted-foreground">昵称</dt>
              <dd>{name || '—'}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt className="text-muted-foreground">邮箱</dt>
              <dd>{email}</dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>

      {/* 修改密码 */}
      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </>
  );
}
