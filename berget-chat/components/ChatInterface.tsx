'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Mic, Paperclip, ChevronDown, ChevronRight, Plus, LogIn, User, LogOut, Settings, MessageCircle, Search } from 'lucide-react'
import { Message, Model, UploadedFile, DocumentChunk } from '@/lib/types'
import MessageList from '@/components/MessageList'
import ModelSelector from '@/components/ModelSelector'
import PromptSelector from '@/components/PromptSelector'
import LanguageSelector from '@/components/LanguageSelector'
import LoginModal from '@/components/LoginModal'
import AccountModal from '@/components/AccountModal'
import SystemPromptModal from '@/components/SystemPromptModal'
import FileUpload from '@/components/FileUpload'
import { streamMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useAudioRecorder } from '@/lib/useAudioRecorder'
import { chunkText } from '@/lib/document-utils'
import { Prompt } from '@/lib/prompts'
import { Conversation as DBConversation, ChatMessage, generateConversationTitle } from '@/lib/chat-history'
import { useTranslation } from 'react-i18next'

interface ChatInterfaceProps {
  messages: Message[]
  setMessages: (messages: Message[]) => void
  onNewChat: () => void
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  currentConversation: DBConversation | null
  onConversationChange: (conversation: DBConversation | null) => void
}

// Models will be defined inside the component to use translations

export default function ChatInterface({ messages, setMessages, onNewChat, isSidebarOpen, onToggleSidebar, currentConversation, onConversationChange }: ChatInterfaceProps) {
  const { t } = useTranslation()
  
  const models: Model[] = [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: t('chat.models.gptOss') },
    { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', description: t('chat.models.llama') },
    { id: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503', name: 'Mistral Small 3.1 24B', description: t('chat.models.mistralSmall') },
    { id: 'mistralai/Devstral-Small-2505', name: 'Devstral Small', description: t('chat.models.devstral') }
  ]

  const [input, setInput] = useState('')
  const [selectedModel, setSelectedModel] = useState<Model>(models[1])
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [sessionPrompts, setSessionPrompts] = useState<Prompt[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false)
  const [currentFunctionCall, setCurrentFunctionCall] = useState<{name: string, args: any} | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [documentChunks, setDocumentChunks] = useState<DocumentChunk[]>([])
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const [showFileUpload, setShowFileUpload] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { isLoggedIn, username, firstName, lastName, systemPrompt, logout } = useAuth()
  const { isRecording, isTranscribing, startRecording, stopRecording } = useAudioRecorder()

  const displayName = firstName && lastName ? `${firstName} ${lastName}` : username

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Chat persistence functions
  const createNewConversation = async (firstMessage: string): Promise<DBConversation | null> => {
    if (!isLoggedIn) return null

    try {
      const token = localStorage.getItem('authToken')
      if (!token) return null

      const title = generateConversationTitle(firstMessage)
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          modelUsed: selectedModel.name,
          promptUsed: selectedPrompt?.name || 'Default'
        })
      })

      if (response.ok) {
        const data = await response.json()
        return data.conversation
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
    return null
  }

  const saveMessage = async (conversationId: number, role: 'user' | 'assistant', content: string, metadata?: any): Promise<void> => {
    if (!isLoggedIn) return

    try {
      const token = localStorage.getItem('authToken')
      if (!token) return

      await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId,
          role,
          content,
          modelUsed: selectedModel.name,
          promptUsed: selectedPrompt?.name || 'Default',
          metadata
        })
      })
    } catch (error) {
      console.error('Error saving message:', error)
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    // Handle conversation creation and message persistence
    let conversationToUse = currentConversation
    
    try {
      // Create new conversation if this is the first message
      if (isLoggedIn && !currentConversation && messages.length === 0) {
        conversationToUse = await createNewConversation(userMessage.content)
        if (conversationToUse) {
          onConversationChange(conversationToUse)
        }
      }

      // Save user message to database
      if (isLoggedIn && conversationToUse) {
        await saveMessage(conversationToUse.Id || conversationToUse.id!, 'user', userMessage.content)
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date()
      }
      
      console.log('Sending', documentChunks.length, 'document chunks to API')
      let fullContent = ''
      // Use selected prompt content, fallback to old system prompt, then undefined
      const promptToUse = selectedPrompt?.content || systemPrompt || undefined
      const stream = streamMessage(updatedMessages, selectedModel.id, promptToUse, (name, args) => {
        setCurrentFunctionCall({ name, args })
      }, documentChunks)
      
      for await (const chunk of stream) {
        fullContent += chunk
        assistantMessage.content = fullContent
        setMessages([...updatedMessages, assistantMessage])
      }
      
      // Save assistant message to database
      if (isLoggedIn && conversationToUse && fullContent) {
        await saveMessage(conversationToUse.Id || conversationToUse.id!, 'assistant', fullContent)
      }
      
      setCurrentFunctionCall(null)
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }
      setMessages([...updatedMessages, errorMessage])
      
      // Save error message to database
      if (isLoggedIn && conversationToUse) {
        await saveMessage(conversationToUse.Id || conversationToUse.id!, 'assistant', errorMessage.content)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  const handleVoiceClick = async () => {
    if (isRecording) {
      // Stop recording and transcribe
      try {
        const transcribedText = await stopRecording()
        setInput(transcribedText)
        
        // Auto-submit the transcribed text
        if (transcribedText.trim()) {
          const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: transcribedText.trim(),
            timestamp: new Date()
          }

          const updatedMessages = [...messages, userMessage]
          setMessages(updatedMessages)
          setInput('')
          setIsLoading(true)

          // Handle conversation creation and message persistence for voice input
          let conversationToUse = currentConversation
          
          try {
            // Create new conversation if this is the first message
            if (isLoggedIn && !currentConversation && messages.length === 0) {
              conversationToUse = await createNewConversation(userMessage.content)
              if (conversationToUse) {
                onConversationChange(conversationToUse)
              }
            }

            // Save user message to database
            if (isLoggedIn && conversationToUse) {
              await saveMessage(conversationToUse.Id || conversationToUse.id!, 'user', userMessage.content)
            }

            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: '',
              timestamp: new Date()
            }
            
            let fullContent = ''
            // Use selected prompt content, fallback to old system prompt, then undefined
            const promptToUse = selectedPrompt?.content || systemPrompt || undefined
            const stream = streamMessage(updatedMessages, selectedModel.id, promptToUse, (name, args) => {
              setCurrentFunctionCall({ name, args })
            }, documentChunks)
            
            for await (const chunk of stream) {
              fullContent += chunk
              assistantMessage.content = fullContent
              setMessages([...updatedMessages, assistantMessage])
            }
            
            // Save assistant message to database
            if (isLoggedIn && conversationToUse && fullContent) {
              await saveMessage(conversationToUse.Id || conversationToUse.id!, 'assistant', fullContent)
            }
            
            setCurrentFunctionCall(null)
          } catch (error) {
            console.error('Error sending message:', error)
            const errorMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: 'Sorry, I encountered an error. Please try again.',
              timestamp: new Date()
            }
            setMessages([...updatedMessages, errorMessage])
            
            // Save error message to database
            if (isLoggedIn && conversationToUse) {
              await saveMessage(conversationToUse.Id || conversationToUse.id!, 'assistant', errorMessage.content)
            }
          } finally {
            setIsLoading(false)
          }
        }
      } catch (error) {
        console.error('Error transcribing audio:', error)
      }
    } else {
      // Start recording
      try {
        await startRecording()
      } catch (error) {
        console.error('Error starting recording:', error)
        alert('Could not access microphone. Please check permissions.')
      }
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  useEffect(() => {
    if (messages.length === 0 && !isLoading) {
      onNewChat()
      // Clear files when starting new chat
      setUploadedFiles([])
      setDocumentChunks([])
      setShowFileUpload(false)
    }
  }, [])

  // Process files when they change
  const handleFilesChange = async (files: UploadedFile[]) => {
    setUploadedFiles(files)
    setIsProcessingFiles(true)

    try {
      if (files.length === 0) {
        setDocumentChunks([])
        return
      }

      console.log('Processing', files.length, 'files for embeddings')
      
      // Create chunks from all files
      const allChunks: DocumentChunk[] = []
      for (const file of files) {
        console.log(`File: ${file.name}, Content length: ${file.content.length}`)
        console.log(`First 200 chars: ${file.content.substring(0, 200)}...`)
        const fileChunks = chunkText(file.content, file.name)
        console.log(`Created ${fileChunks.length} chunks for ${file.name}`)
        fileChunks.forEach((chunk, i) => {
          console.log(`Chunk ${i}: ${chunk.content.length} chars - ${chunk.content.substring(0, 100)}...`)
        })
        allChunks.push(...fileChunks)
      }

      console.log('Created', allChunks.length, 'chunks from files')

      if (allChunks.length > 0) {
        // Get embeddings for all chunks
        const texts = allChunks.map(chunk => chunk.content)
        const response = await fetch('/api/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ texts })
        })

        if (response.ok) {
          const result = await response.json()
          console.log('Embeddings API response:', result)
          const embeddings = result.embeddings || result.data?.map((item: any) => item.embedding)
          console.log('Generated', embeddings?.length, 'embeddings')
          console.log('First embedding dimensions:', embeddings?.[0]?.length)
          // Add embeddings to chunks
          const chunksWithEmbeddings = allChunks.map((chunk, index) => ({
            ...chunk,
            embedding: embeddings[index]
          }))
          setDocumentChunks(chunksWithEmbeddings)
          console.log('Documents are ready for chat!')
        } else {
          console.error('Failed to generate embeddings:', response.status)
        }
      } else {
        setDocumentChunks([])
      }
    } catch (error) {
      console.error('Error processing files:', error)
    } finally {
      setIsProcessingFiles(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-950 h-screen">
      <div className="px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('sidebar.expandSidebar')}
            >
              <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
          {!isSidebarOpen && (
            <button
              onClick={onNewChat}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('sidebar.newChat')}
            >
              <Plus size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
          <ModelSelector 
            models={models}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
          />
          <PromptSelector
            selectedPrompt={selectedPrompt}
            onSelectPrompt={setSelectedPrompt}
            onManagePrompts={() => setShowSystemPromptModal(true)}
            sessionPrompts={sessionPrompts}
            onUpdateSessionPrompts={setSessionPrompts}
          />
          <LanguageSelector />
        </div>
        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <User size={20} className="text-gray-600 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{displayName}</span>
              </button>
              
              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-30">
                    <div className="p-2">
                      <button
                        onClick={() => {
                          setShowAccountModal(true)
                          setShowProfileMenu(false)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left rounded-lg transition-colors"
                      >
                        <User size={16} className="text-gray-600 dark:text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('auth.account')}</span>
                      </button>
                      <button 
                        onClick={() => {
                          setShowSystemPromptModal(true)
                          setShowProfileMenu(false)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left rounded-lg transition-colors"
                      >
                        <MessageCircle size={16} className="text-gray-600 dark:text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('auth.managePrompts')}</span>
                      </button>
                      <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left rounded-lg transition-colors">
                        <Settings size={16} className="text-gray-600 dark:text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('auth.preferences')}</span>
                      </button>
                      <hr className="my-1 border-gray-200 dark:border-gray-700" />
                      <button
                        onClick={() => {
                          logout()
                          setShowProfileMenu(false)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left rounded-lg transition-colors"
                      >
                        <LogOut size={16} className="text-gray-600 dark:text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('auth.signOut')}</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <LogIn size={18} />
              <span className="text-sm font-medium">{t('auth.signIn')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <MessageList messages={messages} isLoading={isLoading} currentFunctionCall={currentFunctionCall} />
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 flex-shrink-0">
        {showFileUpload && (
          <div className="max-w-4xl mx-auto mb-4">
            <FileUpload 
              files={uploadedFiles}
              onFilesChange={handleFilesChange}
              isProcessing={isProcessingFiles}
              documentsReady={documentChunks.length > 0}
            />
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-2 bg-gray-100 dark:bg-gray-900 rounded-2xl p-2">
            <button
              type="button"
              onClick={() => setShowFileUpload(!showFileUpload)}
              className={`p-2 rounded-lg transition-colors ${
                uploadedFiles.length > 0 
                  ? 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800' 
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              title={uploadedFiles.length > 0 ? t('chat.filesUploaded', { count: uploadedFiles.length }) : t('chat.uploadFiles')}
            >
              <Paperclip size={20} className={uploadedFiles.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'} />
            </button>
            
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              className="flex-1 bg-transparent resize-none outline-none py-2 px-2 max-h-[200px] text-gray-900 dark:text-gray-100 placeholder-gray-500"
              rows={1}
            />
            
            <button
              type="button"
              onClick={handleVoiceClick}
              disabled={isTranscribing}
              className={`p-2 rounded-lg transition-colors ${
                isRecording 
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
                  : isTranscribing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              title={isRecording ? t('chat.stopRecording') : isTranscribing ? t('chat.transcribing') : t('chat.startVoiceRecording')}
            >
              <Mic size={20} className={
                isRecording 
                  ? 'text-white' 
                  : isTranscribing 
                  ? 'text-gray-300' 
                  : 'text-gray-600 dark:text-gray-400'
              } />
            </button>
            
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
          <div className="text-center text-xs text-gray-500 mt-2">
{t('chat.poweredBy')}
          </div>
        </form>
      </div>
      
      <LoginModal 
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
      
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />
      
      <SystemPromptModal
        isOpen={showSystemPromptModal}
        onClose={() => setShowSystemPromptModal(false)}
        sessionPrompts={sessionPrompts}
        onUpdateSessionPrompts={setSessionPrompts}
      />
      
    </div>
  )
}