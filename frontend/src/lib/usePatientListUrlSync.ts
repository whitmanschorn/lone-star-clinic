import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { listStateReplaced, selectPatientList } from '../store/patientListSlice'
import { listStateToQuery, queryToListState } from './patientListUrl'

/**
 * Keep the patient list's state and the address bar in step, so that any
 * view (search, filters, sort, page) can be bookmarked, shared or reloaded.
 *
 * Two rules decide which side wins:
 * - A query string that arrived from outside (a bookmark, a shared link,
 *   back/forward) is read into the store.
 * - Otherwise the store is mirrored into the address bar. That includes
 *   arriving at plain /patients from elsewhere in the app, which means
 *   "show the list as I left it".
 *
 * The URL is replaced rather than pushed, so the Back button leaves the list
 * instead of stepping through every keystroke of a search.
 */
export function usePatientListUrlSync() {
  const dispatch = useAppDispatch()
  const state = useAppSelector(selectPatientList)
  const [searchParams, setSearchParams] = useSearchParams()

  const stateQuery = listStateToQuery(state)
  // Sorted, like stateQuery, so the two can be compared as strings.
  const sortedParams = new URLSearchParams(searchParams)
  sortedParams.sort()
  const urlQuery = sortedParams.toString()
  // Query strings this hook has itself put in, or accepted from, the address
  // bar. Anything else that shows up there came from outside.
  const ours = useRef(new Set<string>())

  useEffect(() => {
    if (urlQuery === stateQuery) {
      ours.current = new Set([stateQuery])
      return
    }

    if (urlQuery !== '' && !ours.current.has(urlQuery)) {
      const fromUrl = queryToListState(new URLSearchParams(urlQuery))
      // Compare after normalising: invalid or default values in the address
      // are dropped, and may leave nothing new to apply.
      if (listStateToQuery(fromUrl) !== stateQuery) {
        ours.current.add(urlQuery)
        dispatch(listStateReplaced(fromUrl))
        return
      }
    }

    ours.current.add(stateQuery)
    setSearchParams(new URLSearchParams(stateQuery), { replace: true })
  }, [dispatch, setSearchParams, stateQuery, urlQuery])
}
