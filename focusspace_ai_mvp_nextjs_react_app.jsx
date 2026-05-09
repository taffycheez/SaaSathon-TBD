export default function FocusSpaceAI() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* NAVBAR */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">FocusSpace AI</h1>
            <p className="text-sm text-gray-500">
              Workspace productivity optimization
            </p>
          </div>

          <button className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100">
            Sign In
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-16 text-center">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-4 text-5xl font-semibold tracking-tight">
              Optimize Your Workspace For Focus
            </h2>

            <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-600">
              Upload a photo of your workspace and receive AI-powered
              productivity analysis, focus scoring, ergonomic insights, and
              actionable improvements.
            </p>
          </div>

          {/* UPLOAD CARD */}
          <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-gray-300 bg-white p-12 shadow-sm">
            <div className="flex flex-col items-center justify-center">
              <div className="mb-6 rounded-full bg-gray-100 p-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-8 w-8 text-gray-700"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 16.5V3m0 0-3.75 3.75M12 3l3.75 3.75M3 15v3.75A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V15"
                  />
                </svg>
              </div>

              <h3 className="mb-2 text-xl font-medium">
                Upload Workspace Image
              </h3>

              <p className="mb-8 text-sm text-gray-500">
                Drag & drop an image or click to upload
              </p>

              <button className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800">
                Select Image
              </button>
            </div>
          </div>

          <div className="mt-6">
            <button className="rounded-xl bg-black px-8 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
              Analyze Workspace
            </button>
          </div>
        </section>

        {/* ANALYSIS STATE */}
        <section className="mb-16 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold">
                AI Workspace Analysis
              </h3>
              <p className="text-sm text-gray-500">
                Processing spatial productivity signals...
              </p>
            </div>

            <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
              72% Complete
            </div>
          </div>

          <div className="mb-8 h-3 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-[72%] rounded-full bg-black"></div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <p className="text-sm font-medium">
                  Desk placement detected
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <p className="text-sm font-medium">
                  Lighting conditions evaluated
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                <p className="text-sm font-medium">
                  Assessing distraction sources...
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                <p className="text-sm font-medium">
                  Calculating focus optimization score...
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* RESULTS DASHBOARD */}
        <section>
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="text-3xl font-semibold">
                Workspace Report
              </h3>
              <p className="text-sm text-gray-500">
                AI-generated productivity analysis
              </p>
            </div>

            <button className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100">
              Export PDF
            </button>
          </div>

          {/* SCORE CARDS */}
          <div className="mb-8 grid gap-6 md:grid-cols-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="mb-3 text-sm text-gray-500">Focus Score</p>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-semibold">82</span>
                <span className="pb-1 text-sm text-green-600">Good</span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="mb-3 text-sm text-gray-500">
                Ergonomics Score
              </p>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-semibold">74</span>
                <span className="pb-1 text-sm text-yellow-600">Average</span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="mb-3 text-sm text-gray-500">
                Distraction Risk
              </p>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-semibold">38</span>
                <span className="pb-1 text-sm text-green-600">Low</span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="mb-3 text-sm text-gray-500">Energy Score</p>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-semibold">79</span>
                <span className="pb-1 text-sm text-green-600">Strong</span>
              </div>
            </div>
          </div>

          {/* MAIN GRID */}
          <div className="mb-8 grid gap-8 lg:grid-cols-2">
            {/* IMAGE */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-lg font-semibold">Workspace Image</h4>

                <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  AI Analysed
                </div>
              </div>

              <div className="flex aspect-video items-center justify-center rounded-xl bg-gray-100">
                <p className="text-sm text-gray-500">
                  Uploaded workspace preview
                </p>
              </div>
            </div>

            {/* INSIGHTS */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h4 className="mb-6 text-lg font-semibold">AI Insights</h4>

              <div className="mb-6">
                <h5 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Top Issues
                </h5>

                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium">
                        Desk facing distraction zone
                      </p>
                      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                        High
                      </span>
                    </div>

                    <p className="text-sm text-gray-600">
                      Workspace is oriented toward visually active area,
                      increasing attention switching.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium">Uneven lighting balance</p>
                      <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
                        Medium
                      </span>
                    </div>

                    <p className="text-sm text-gray-600">
                      Monitor positioning creates inconsistent ambient lighting.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  AI Summary
                </h5>

                <p className="text-sm leading-7 text-gray-600">
                  Your workspace demonstrates a strong foundational layout but
                  suffers from moderate visual distraction and inconsistent
                  lighting conditions. Small environmental adjustments could
                  significantly improve sustained focus and cognitive
                  performance.
                </p>
              </div>
            </div>
          </div>

          {/* ACTION PLAN */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h4 className="text-2xl font-semibold">
                  Recommended Action Plan
                </h4>

                <p className="text-sm text-gray-500">
                  Highest-impact productivity improvements
                </p>
              </div>

              <div className="rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-700">
                Estimated Focus Gain +14
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 border-l-4 border-l-black p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h5 className="mb-2 text-lg font-semibold">
                      Rotate desk toward left wall
                    </h5>

                    <p className="text-sm text-gray-600">
                      Reduces peripheral distraction and improves visual focus
                      consistency.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                      High Impact
                    </span>

                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Low Effort
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 border-l-4 border-l-black p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h5 className="mb-2 text-lg font-semibold">
                      Introduce indirect warm lighting
                    </h5>

                    <p className="text-sm text-gray-600">
                      Balances screen brightness and reduces visual fatigue.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                      Medium Impact
                    </span>

                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Low Effort
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 border-l-4 border-l-black p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h5 className="mb-2 text-lg font-semibold">
                      Remove non-work items from desk surface
                    </h5>

                    <p className="text-sm text-gray-600">
                      Lowering visible object density improves cognitive clarity
                      and task persistence.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                      Medium Impact
                    </span>

                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Low Effort
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
