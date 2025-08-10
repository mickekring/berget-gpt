'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from 'react-i18next'

interface AccountModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const { firstName, lastName, username, updateProfile } = useAuth()
  const { t } = useTranslation()
  const [firstNameInput, setFirstNameInput] = useState('')
  const [lastNameInput, setLastNameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')

  useEffect(() => {
    if (firstName) setFirstNameInput(firstName)
    if (lastName) setLastNameInput(lastName)
    // Get email from localStorage since it's not in the auth context yet
    const savedUser = localStorage.getItem('userData')
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser)
        if (userData.email) setEmailInput(userData.email)
      } catch (error) {
        console.error('Failed to parse saved user data:', error)
      }
    }
  }, [firstName, lastName])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const success = await updateProfile(firstNameInput.trim(), lastNameInput.trim(), emailInput.trim())
      
      if (success) {
        onClose()
      } else {
        alert(t('auth.profileUpdateFailed'))
      }
    } catch (error) {
      console.error('AccountModal: Error during update', error)
      alert(t('auth.profileUpdateError'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('auth.accountSettings')}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('auth.firstName')}
            </label>
            <input
              id="firstName"
              type="text"
              value={firstNameInput}
              onChange={(e) => setFirstNameInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('auth.lastName')}
            </label>
            <input
              id="lastName"
              type="text"
              value={lastNameInput}
              onChange={(e) => setLastNameInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('auth.emailAddress')}
            </label>
            <input
              id="email"
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('auth.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              {t('auth.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}