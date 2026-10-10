"use client"

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary via-background to-secondary flex items-center justify-center z-50">
      <div className="text-center space-y-8">
        {/* Logo Animation */}
        <div className="animate-pulse-subtle">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <span className="text-4xl font-bold text-primary-foreground">S</span>
          </div>
        </div>

        {/* Loading Text */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">SAJI</h1>
          <p className="text-muted-foreground text-sm animate-pulse-subtle">
            Connecting you with trusted service providers
          </p>
        </div>

        {/* Animated Loading Bar */}
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full animate-[slideInLeft_2s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  )
}
