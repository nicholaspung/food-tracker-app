import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/whats-new')({
  component: WhatsNewPage,
})

interface ChangelogEntry {
  version: string
  date: string
  title: string
  summary: string
  features?: string[]
  improvements?: string[]
  fixes?: string[]
}

function WhatsNewPage() {
  const navigate = useNavigate()

  const { data: changelog, isLoading, error } = useQuery<ChangelogEntry[]>({
    queryKey: ['changelog'],
    queryFn: async () => {
      const response = await fetch('/changelog.json')
      if (!response.ok) {
        throw new Error('Failed to fetch changelog')
      }
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading updates...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Updates</CardTitle>
            <CardDescription>
              We couldn't load the latest updates. Please try again later.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Mobile Header - Fixed */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: '/profile' })}
              className="h-8 px-2 text-gray-600 hover:text-gray-900"
              data-testid="back-button"
            >
              ← Back
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">What's New</h1>
          <p className="text-sm text-gray-600 mt-1">
            Latest features and improvements
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {!changelog || changelog.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-gray-600 text-center">No updates yet. Check back soon!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {changelog.map((entry, index) => (
              <Card key={entry.version} className={index === 0 ? 'border-blue-500 border-2' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Badge variant={index === 0 ? 'default' : 'secondary'} className="shrink-0">
                      v{entry.version}
                    </Badge>
                    {index === 0 && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Latest
                      </Badge>
                    )}
                    <span className="text-xs text-gray-500 ml-auto">{entry.date}</span>
                  </div>
                  <CardTitle className="text-lg leading-tight">{entry.title}</CardTitle>
                  <CardDescription className="text-sm">{entry.summary}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {entry.features && entry.features.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center">
                          <span className="mr-1.5">✨</span> New Features
                        </h3>
                        <ul className="space-y-1">
                          {entry.features.map((feature, idx) => (
                            <li key={idx} className="text-sm text-gray-700 flex items-start">
                              <span className="mr-2 mt-0.5 text-gray-400">•</span>
                              <span className="flex-1">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {entry.improvements && entry.improvements.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center">
                          <span className="mr-1.5">🚀</span> Improvements
                        </h3>
                        <ul className="space-y-1">
                          {entry.improvements.map((improvement, idx) => (
                            <li key={idx} className="text-sm text-gray-700 flex items-start">
                              <span className="mr-2 mt-0.5 text-gray-400">•</span>
                              <span className="flex-1">{improvement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {entry.fixes && entry.fixes.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center">
                          <span className="mr-1.5">🐛</span> Bug Fixes
                        </h3>
                        <ul className="space-y-1">
                          {entry.fixes.map((fix, idx) => (
                            <li key={idx} className="text-sm text-gray-700 flex items-start">
                              <span className="mr-2 mt-0.5 text-gray-400">•</span>
                              <span className="flex-1">{fix}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
