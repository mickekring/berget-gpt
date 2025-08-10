'use client'

import { Message } from '@/lib/types'
import { User, Bot, Search, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import MarkdownMessage from '@/components/MarkdownMessage'
import { useTranslation } from 'react-i18next'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  currentFunctionCall?: {name: string, args: any} | null
}

export default function MessageList({ messages, isLoading, currentFunctionCall }: MessageListProps) {
  const { t } = useTranslation()
  
  // Helper function to determine if a message is currently streaming
  const isMessageStreaming = (messageIndex: number, message: Message) => {
    const isLastMessage = messageIndex === messages.length - 1
    const isAssistantMessage = message.role === 'assistant'
    return isLoading && isLastMessage && isAssistantMessage
  }

  return (
    <div className="flex-1 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={clsx(
              'flex gap-4',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Bot size={18} className="text-white" />
              </div>
            )}
            
            <div
              className={clsx(
                'max-w-[70%] rounded-2xl px-4 py-3',
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              )}
            >
              {message.role === 'assistant' ? (
                <MarkdownMessage 
                  content={message.content}
                  isStreaming={isMessageStreaming(index, message)}
                />
              ) : (
                <div className="whitespace-pre-wrap break-words">
                  {message.content}
                </div>
              )}
            </div>
            
            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-white" />
              </div>
            )}
          </div>
        ))}
        
        {currentFunctionCall && (
          <div className="flex gap-4 justify-start">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              currentFunctionCall.name === 'search_documents' 
                ? 'bg-gradient-to-br from-orange-500 to-red-600'
                : 'bg-gradient-to-br from-green-500 to-blue-600'
            }`}>
              {currentFunctionCall.name === 'search_documents' ? (
                <FileText size={18} className="text-white animate-pulse" />
              ) : (
                <Search size={18} className="text-white animate-pulse" />
              )}
            </div>
            <div className={`rounded-2xl px-4 py-3 border ${
              currentFunctionCall.name === 'search_documents'
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            }`}>
              <div className={`text-sm ${
                currentFunctionCall.name === 'search_documents'
                  ? 'text-orange-700 dark:text-orange-300'
                  : 'text-green-700 dark:text-green-300'
              }`}>
{currentFunctionCall.name === 'search_documents' 
                  ? t('chat.searchingDocuments')
                  : t('chat.searchingInternet')
                }
              </div>
            </div>
          </div>
        )}
        
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && !currentFunctionCall && (
          <div className="flex gap-4 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Bot size={18} className="text-white" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        
        {messages.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400">
              <Bot size={48} className="mx-auto mb-4 opacity-50" />
              <h2 className="text-xl font-semibold mb-2">{t('chat.welcomeTitle')}</h2>
              <p className="text-sm">{t('chat.welcomeSubtitle')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}