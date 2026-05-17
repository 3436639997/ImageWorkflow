import * as React from "react"

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@workspace/ui/components/command"
import { Input } from "@workspace/ui/components/input"
import { Popover, PopoverAnchor, PopoverContent } from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

type ComboboxOption = {
  value: string
  label?: string
  keywords?: string[]
}

type ComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyLabel?: string
  createLabel?: (value: string) => string
  className?: string
  disabled?: boolean
}

function normalize(text: string) {
  return text.trim().toLowerCase()
}

function matchesOption(option: ComboboxOption, query: string) {
  const target = [
    option.label ?? option.value,
    option.value,
    ...(option.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase()

  return target.includes(query)
}

function getOptionLabel(options: ComboboxOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value
}

function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "输入或选择",
  emptyLabel = "没有匹配项",
  createLabel = (nextValue) => `使用 “${nextValue}”`,
  className,
  disabled = false,
}: ComboboxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState(() => getOptionLabel(options, value))

  React.useEffect(() => {
    setQuery(getOptionLabel(options, value))
  }, [options, value])

  const normalizedQuery = normalize(query)
  const filteredOptions = React.useMemo(() => {
    if (!normalizedQuery) {
      return options
    }

    return options.filter((option) => matchesOption(option, normalizedQuery))
  }, [normalizedQuery, options])

  const hasExactMatch = React.useMemo(
    () =>
      options.some((option) => {
        const label = option.label ?? option.value
        return normalize(label) === normalizedQuery || normalize(option.value) === normalizedQuery
      }),
    [normalizedQuery, options]
  )

  function selectValue(nextValue: string) {
    onValueChange(nextValue)
    setQuery(getOptionLabel(options, nextValue))
    setOpen(false)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <Input
            ref={inputRef}
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(event) => {
              const nextValue = event.target.value
              setQuery(nextValue)
              onValueChange(nextValue)
              if (!open) {
                setOpen(true)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false)
                inputRef.current?.blur()
              }

              if (event.key === "Enter" && normalizedQuery) {
                const exactOption = options.find((option) => {
                  const label = option.label ?? option.value
                  return normalize(label) === normalizedQuery || normalize(option.value) === normalizedQuery
                })

                if (exactOption) {
                  event.preventDefault()
                  selectValue(exactOption.value)
                  return
                }

                event.preventDefault()
                selectValue(query.trim())
              }
            }}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            ▾
          </span>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {filteredOptions.length === 0 && !normalizedQuery ? (
              <CommandEmpty>{emptyLabel}</CommandEmpty>
            ) : null}
            {filteredOptions.length === 0 && normalizedQuery ? (
              <CommandEmpty>没有匹配的模型</CommandEmpty>
            ) : null}
            {filteredOptions.length > 0 ? (
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onMouseDown={(event) => event.preventDefault()}
                    onSelect={() => selectValue(option.value)}
                  >
                    <span className="truncate">{option.label ?? option.value}</span>
                    {option.value === value ? (
                      <span className="ml-auto text-xs text-muted-foreground">已选</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {normalizedQuery && !hasExactMatch ? (
              <div className="border-t border-border/70 p-1">
                <CommandItem
                  value={`__custom__${query}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onSelect={() => selectValue(query.trim())}
                >
                  <span className="truncate">{createLabel(query.trim())}</span>
                </CommandItem>
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox, type ComboboxOption }
