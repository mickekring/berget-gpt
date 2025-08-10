'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface MarkdownMessageProps {
  content: string
  isStreaming?: boolean
  className?: string
}

interface CodeBlockProps {
  children: string
  className?: string
  inline?: boolean
}

export default function MarkdownMessage({ content, isStreaming = false, className = "" }: MarkdownMessageProps) {
  const [copiedBlocks, setCopiedBlocks] = useState<Set<string>>(new Set())

  const copyToClipboard = async (code: string, blockId: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedBlocks(prev => new Set(prev).add(blockId))
      setTimeout(() => {
        setCopiedBlocks(prev => {
          const newSet = new Set(prev)
          newSet.delete(blockId)
          return newSet
        })
      }, 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const CodeBlock = ({ children, className, inline }: CodeBlockProps) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''
    const code = String(children).replace(/\n$/, '')
    const blockId = `${code.slice(0, 50)}-${Date.now()}`
    const isCopied = copiedBlocks.has(blockId)

    if (inline) {
      return (
        <code className="bg-gray-100 dark:bg-gray-800 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded text-sm font-mono">
          {children}
        </code>
      )
    }

    return (
      <div className="relative group my-4">
        <div className="absolute right-3 top-3 z-10">
          <button
            onClick={() => copyToClipboard(code, blockId)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
            title="Copy code"
          >
            {isCopied ? (
              <Check size={16} className="text-green-400" />
            ) : (
              <Copy size={16} />
            )}
          </button>
        </div>
        <SyntaxHighlighter
          style={oneDark}
          language={language || 'text'}
          PreTag="div"
          className="rounded-lg !mt-0 !mb-0"
          showLineNumbers={code.split('\n').length > 10}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    )
  }

  // If streaming, show plain text to avoid broken markdown during partial renders
  if (isStreaming) {
    return (
      <div className={`whitespace-pre-wrap break-words ${className}`}>
        {content}
      </div>
    )
  }

  // When complete, render as markdown
  return (
    <div className={`text-gray-900 dark:text-gray-100 max-w-none prose prose-gray dark:prose-invert ${className}`}>
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        skipHtml={true}
        components={{
          code: CodeBlock
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}