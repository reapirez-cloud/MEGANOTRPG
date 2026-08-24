import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export default function Home() {
  return (
    <div className="space-y-5">

      <Card className="overflow-hidden border-zinc-800 bg-zinc-950">
        <div className="h-52 bg-gradient-to-br from-violet-900 via-zinc-900 to-black flex items-center justify-center text-zinc-400">
          ОБЛОЖКА КАМПАНИИ
        </div>

        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-2xl font-bold">
              Проклятые земли
            </h2>
            <p className="text-sm text-zinc-400">
              Глава III · Башня на севере
            </p>
          </div>

          <Button className="w-full rounded-xl">
            Продолжить игру
          </Button>
        </CardContent>
      </Card>


      <Card className="border-zinc-800 bg-zinc-950">
        <CardContent className="p-5">
          <h3 className="mb-4 font-semibold">
            Игроки
          </h3>

          <div className="flex gap-3">
            {["В", "Л", "Т", "Р"].map((item) => (
              <Avatar key={item}>
                <AvatarFallback>
                  {item}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        </CardContent>
      </Card>


      <Card className="border-zinc-800 bg-zinc-950">
        <CardContent className="p-5">
          <h3 className="mb-3 font-semibold">
            Последние события
          </h3>

          <div className="rounded-xl bg-zinc-900 p-4">
            <p className="font-medium">
              Новая сцена открыта
            </p>
            <p className="text-sm text-zinc-400">
              Группа достигла северной башни
            </p>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
